import { readdirSync } from 'fs';
import { join } from 'path';
import { cwd } from 'process';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes, TextChannel } from 'discord.js';
import { IDiscordCommand } from '../types/IDiscordCommand.js';
import { IVladiator } from '../types/IVladiator.js';
import { IMessage } from '../types/IMessage.js';
import fws from "fixed-width-string";
import { ethers } from "ethers";

export class ServiceDiscord {
    private client: Client;
    private vladiator: IVladiator;
    private channelId: string;
    private commandChannelId: string;
    private commands = new Collection<string, IDiscordCommand>();

    constructor(
        vladiator: IVladiator,
        token: string,
        clientId: string,
        channelId: string,
        commandChannelId: string
    ) {
        this.vladiator = vladiator;
        this.channelId = channelId;
        this.commandChannelId = commandChannelId;

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
            ],
        });

        this.initializeClient(token, clientId);
    }

    private async initializeClient(token: string, clientId: string): Promise<void> {
        this.loadCommands();
        this.registerClientEvents(clientId, token);

        await this.client.login(token);
    }

    private loadCommands(): void {
        const foldersPath = join(cwd(), '/src/commands');
        const commandFolders = readdirSync(foldersPath);

        commandFolders.forEach(folder => {
            const commandsPath = join(foldersPath, folder);
            const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

            commandFiles.forEach(async file => {
                const filePath = join(commandsPath, file);
                const command: IDiscordCommand = await import(filePath);
                if (command.data && command.execute!) {
                    this.commands.set(command.data.name, command);
                    console.log('loaded command', command.data.name);
                } else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            });
        });
    }

    private registerClientEvents(clientId: string, token: string): void {
        this.client.once(Events.ClientReady, async () => {
            console.log(`Logged in as ${this.client.user!.tag}!`);
            const rest = new REST().setToken(token);
            try {
                const commandsData = [...this.commands.values()].map(command => command.data);
                await rest.put(Routes.applicationCommands(clientId), { body: commandsData });
                console.log('Commands Updated!');
            } catch (error) {
                console.error(error);
            }
        });

        this.client.on(Events.InteractionCreate, async (interaction) => {
            if (!interaction.isChatInputCommand() || interaction.channelId != this.commandChannelId) return;

            const command = this.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(this.vladiator, interaction);
            } catch (error) {
                console.error(error);
                const reply = { content: 'There was an error while executing this command!', ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            }
        });
    }

    async message(content: string): Promise<void> {
        try {
            const channel = await this.client.channels.fetch(this.channelId) as TextChannel;
            await channel.send(content);
        } catch (e) {
            console.log(e);
        }
    }

    async sendDiscordMessage(message: IMessage | string): Promise<void> {
        if (typeof message !== 'string') {
            message = this.formatMessage(message);
        }

        if (message === '') {
            return;
        }

        await this.message('`' + message + '`');
    }

    private formatMessage(log: IMessage): string {
        let message: string;

        switch (log.type) {
            case 'MESSAGE:REQUEST':
                message = fws('MESSAGE:REQUEST', 20);
                break;
            case 'MESSAGE:SIGNED':
                return '';
            case 'MESSAGE:EXECUTION':
                message = fws('MESSAGE:EXECUTION', 20);
                break;
            case 'MESSAGE:QUEUED':
                message = fws('MESSAGE:QUEUED', 20);
                break;
            case 'MESSAGE:INVALID':
                message = fws('MESSAGE:INVALID', 20);
                break;
            case 'MESSAGE:EXISTS':
                return '';
            case 'FEATURE:START':
                message = fws('FEATURE:START', 20);
                break;
            case 'FEATURE:FAILED':
                message = fws('FEATURE:FAILED', 20);
                break;
            case 'PENALTY:CHAINMISS':
                message = fws('PENALTY:CHAINMISS', 20);
                break;
            case 'HEARTBEAT':
                return '';
            default:
                message = fws('UNKNOWN', 20);
                break;
        }

        if (!log.values) {
            message += fws('......', 7) + " ";
        } else {
            message += fws(log.values!.txId, 7, { align: "right", ellipsis: false }) + " ";
        }

        message += fws(String(log.source), 7) + "->";
        if (!log.values) {
            message += fws('......', 7) + " ";
        } else {
            message += fws(String(log.values!.chain), 7) + " ";
        }

        message += fws(log.author, 8) + " ";
        message += log.transactionHash + " ";

        if (log.type === 'MESSAGE:EXECUTION') {
            message += this.formatExecutionMessage(log);
        }

        return message;
    }

    private formatExecutionMessage(log: IMessage): string {
        let message = "\n";
        message += "/--------------------------------------------------\n";
        message += "|  TRANSACTION ID: " + log.values!.txId + " \n";
        message += "|    SOURCE CHAIN: " + log.source + " \n";
        message += "|      DEST CHAIN: " + log.values!.chain + " \n";
        message += "|  SOURCE TX HASH: " + log.transactionHash + " \n";
        message += "|    DEST TX HASH: " + log.executionHash + " \n";
        message += "| CONTRACT SENDER: " + log.values!.sender + " \n";
        message += "|  CONTRACT RECIP: " + log.values!.recipient + " \n";
        message += "|         EXPRESS: " + log.values!.express + " \n";
        message += "|   CONFIRMATIONS: " + log.values!.confirmations + " \n";
        message += "|           EXSIG: " + fws(log.exsig!, 20) + " \n";
        message += "|        CHAINSIG: " + fws(log.chainsig!, 20) + " \n";

        if (log.tokenPrice) {
            message += "|     TOKEN PRICE: $" + log.tokenPrice + " \n";
        }

        let srcGasActual, destGasActual, destGasRefund, validatorBalanceETH;
        try {
            srcGasActual = ethers.utils.formatEther(ethers.BigNumber.from(log.sourceGas));
            destGasActual = ethers.utils.formatEther(ethers.BigNumber.from(log.destGas));
            destGasRefund = ethers.utils.formatEther(ethers.BigNumber.from(log.destGasRefund));
            validatorBalanceETH = ethers.utils.formatEther(ethers.BigNumber.from(log.validatorBalance!));

            message += "|  SRC GAS ACTUAL: " + srcGasActual + " \n";

            if (log.tokenPrice) {
                const tokenPriceInUSD = parseFloat(log.tokenPrice);
                const destGasActualUSD = (parseFloat(destGasActual) * tokenPriceInUSD).toFixed(2);
                const destGasRefundUSD = (parseFloat(destGasRefund) * tokenPriceInUSD).toFixed(2);
                const validatorBalanceUSD = (parseFloat(validatorBalanceETH) * tokenPriceInUSD).toFixed(2);

                message += "| DEST GAS ACTUAL: " + destGasActual + " (~$" + destGasActualUSD + " USD) \n";
                message += "| DEST GAS REFUND: " + destGasRefund + " (~$" + destGasRefundUSD + " USD) \n";
                message += "| VALIDATOR BALANCE: " + validatorBalanceETH + " ETH (~$" + validatorBalanceUSD + " USD) \n";
            } else {
                message += "| DEST GAS ACTUAL: " + destGasActual + " \n";
                message += "| DEST GAS REFUND: " + destGasRefund + " \n";
                message += "| VALIDATOR BALANCE: " + validatorBalanceETH + " ETH \n";
            }
        } catch (e) {
            message += "| ERROR CALCULATING GAS DETAILS \n";
        }

        if (log.featureId) {
            message += "|--------------------------------------------------\n";
            message += "|      FEATURE ID: " + log.featureId + " \n";
        }

        message += "\\--------------------------------------------------";

        return message;
    }
}
