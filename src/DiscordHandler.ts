// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { readdirSync } from 'fs';
import { join } from 'path';
import { cwd } from 'process';
import { Client, Collection, Events, GatewayIntentBits, REST, Routes } from 'discord.js';
import { IDiscordCommand } from './types/IDiscordCommand.js';
import DriverBase from './drivers/DriverBase.js';
import { IMessage } from './types/IMessage.js';
import fws from "fixed-width-string";

/**
 * Handles Discord interactions for the application, including commands and message processing.
 */
export class DiscordHandler {
    private vladiator: any;
    private client?: Client;
    private channelId: string;
    private commandChannelId: string;
    private commands = new Collection<string, IDiscordCommand>();

    /**
     * Constructs the handler and initializes the Discord client.
     * @param vladiator Reference to the main application logic.
     * @param token Discord bot token.
     * @param clientId Discord client ID.
     * @param channelId ID of the Discord channel where commands will be received.
     * @param commandChannelId ID of the Discord channel where commands will be sent.
     */
    constructor(vladiator: any, token: string, clientId: string, channelId: string, commandChannelId: string) {
        this.vladiator = vladiator;
        this.channelId = channelId;
        this.commandChannelId = commandChannelId;

        this.initializeClient(token, clientId);
    }

    /**
     * Initializes the Discord client with specific intents, loads commands, and registers event handlers.
     * @param token Discord bot token.
     * @param clientId Discord client ID.
     */
    private async initializeClient(token: string, clientId: string): Promise<void> {
        this.client = new Client({ intents: [GatewayIntentBits.Guilds] });

        this.loadCommands();
        this.registerClientEvents(clientId, token);

        await this.client.login(token);
    }

    /**
     * Loads commands from the 'commands' directory within the source directory.
     */
    private loadCommands(): void {
        const foldersPath = join(cwd(), '/src/commands');
        const commandFolders = readdirSync(foldersPath);

        commandFolders.forEach(folder => {
            const commandsPath = join(foldersPath, folder);
            const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.ts'));

            /*commandFiles.forEach(async file => {
                const filePath = join(commandsPath, file);
                const command: IDiscordCommand = await import(filePath);
                if (command.data && command.execute!) {
                    this.commands.set(command.data.name, command);
                    console.log('loaded command', command.data.name);
                } else {
                    console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
                }
            });*/
        });
    }

    /**
     * Registers event handlers for the Discord client, including command handling and client readiness.
     * @param clientId Discord client ID.
     * @param token Discord bot token.
     */
    private registerClientEvents(clientId: string, token: string): void {
        if (!this.client) return;

        this.client.once(Events.ClientReady, async () => {
            console.log('Ready!');
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

    /**
     * Sends a message to a specified Discord channel.
     * @param data String message to be sent.
     */
    async message(data: string): Promise<void> {
        if (!this.client) return;
        try {
            const channel = await this.client.channels.fetch(this.channelId);
            if ('send' in channel!) channel.send({ content: data });
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * Processes and sends messages or IMessage structures to the configured Discord channel.
     * Applies formatting based on message type and details.
     * @param message String or IMessage object containing message details.
     */
    async send(message: string | IMessage): Promise<void> {
        if(typeof message !== 'string') {
            let destDriver: DriverBase | undefined = undefined;
            try {
                destDriver = this.vladiator.drivers[Number(message.values!.chain)];
            } catch (error) {}

            const log = message;
            switch(log.type) {
                case 'MESSAGE:REQUEST':
                    if(destDriver) return;
                    message = fws('MESSAGE:REQUEST', 20);
                    break;
                case 'MESSAGE:SIGNED':
                    if(destDriver) return;
                    message = fws('MESSAGE:SIGNED', 20);
                    break;
                case 'MESSAGE:EXECUTION':
                    message = fws('MESSAGE:EXECUTION', 20);
                    break;
                case 'MESSAGE:QUEUED':
                    message = fws('MESSAGE:QUEUED', 20);
                    break;
                case 'MESSAGE:INVALID':
                    message = fws('MESSAGE:INVALID', 20);
                    break;
                case 'FEATURE:START':
                    message = fws('FEATURE:START', 20);
                    break;
                case 'FEATURE:FAILED':
                    message = fws('FEATURE:FAILED', 20);
                    break;
                default:
                    message = fws('UNKNOWN', 20);
                    break;
            }
            
            if(!log.values) {
                message += fws('......', 7) + " ";
            } else {
                message += fws(log.values!.txId, 7, {align: "right", ellipsis: false}) + " ";
            }

            message += fws(String(log.source), 7) + "->";
            if(!log.values) {
                message += fws('......', 7) + " ";
            } else {
                message += fws(String(log.values!.chain), 7) + " ";
            }
    
            message += fws(log.author, 8) + " ";
            message += log.transactionHash + " ";

            if(log.type === 'MESSAGE:EXECUTION') {
                message += "\n";
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
                if(log.featureId) {
                message += "|--------------------------------------------------\n";
                message += "|      FEATURE ID: " + log.featureId + " \n";
                }
                message += "\\--------------------------------------------------";
            }
        }

        this.message('`'+message+'`');
    }        
}

export default DiscordHandler;