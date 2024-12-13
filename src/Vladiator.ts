// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { IChainConfig } from "./types/IChainConfig.js";
import { IVladiator } from "./types/IVladiator.js";
import { IMessage } from "./types/IMessage.js";
import { ServiceDiscord } from "./services/ServiceDiscord.js";
import { ServiceP2P } from "./services/ServiceP2P.js";
import { ServiceHeartbeat } from "./services/ServiceHeartbeat.js";
import { logTraffic } from "./utils/logTraffic.js";
import DriverBase from "./drivers/DriverBase.js";
import DriverEVM from "./drivers/DriverEVM.js";
import DriverReef from "./drivers/DriverReef.js";
import DataStreamServer from "./DataStreamServer.js";
import { join } from "path";
import { cwd } from "process";
import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
global.require = require;

/**
 * Core class for the Vladiator system, handling P2P network operations, message processing, and driver management.
 */
export class Vladiator implements IVladiator {
    public nodePrivateKey: string;
    public nodePublicKey: string;
    public drivers: { [chainId: number]: DriverBase } = {};
    public discord!: ServiceDiscord;
    public dataStreamServer!: DataStreamServer;
    public features: { [featureId: string]: any } = {};
    
    private p2pService: ServiceP2P;
    private heartbeatService: ServiceHeartbeat;
    private config: IChainConfig;

    /**
     * Initializes Vladiator with necessary configuration and private keys.
     * @param nodePrivateKey Private key for the node.
     * @param config Configuration object containing network settings.
     */
    constructor(nodePrivateKey: string, config: IChainConfig, filters?: Partial<IMessage>) {
        this.nodePrivateKey = nodePrivateKey;
        this.nodePublicKey = process.env.NODE_PUBLIC_KEY || '';
        this.config = config;

        // Initialize services
        this.p2pService = new ServiceP2P(this.handleMessage.bind(this));
        this.heartbeatService = new ServiceHeartbeat(this.nodePublicKey, this.sendMessage.bind(this));
    
        this.initialize(filters).catch(error => {
            console.error("Failed to initialize:", error);
            process.exit(1);
        });
    }

    /**
     * Starts the initialization process for Discord, P2P, and chain drivers.
     */
    private async initialize(filters?: Partial<IMessage>): Promise<void> {
        await this.connectDiscord();
        await this.connectDataStreamServer(filters);
        await this.p2pService.connect();
        await this.loadChainDrivers();
        await this.loadFeatureDirectory();
        this.heartbeatService.startHeartbeat(2 * 60 * 1000); // 2 minutes interval
    }

    /**
     * Loads features from the features directory.
     */
    public async loadFeatureDirectory(): Promise<void> {
        // Load features from the features/index.ts file
        const featurePath = path.join(cwd(), 'src/features');
        if (!fs.existsSync(featurePath)) {
            console.log("No features directory found");
            return;
        }
    
        try {
            // Dynamically import the features/index.ts file
            const featuresModule = await import(pathToFileURL(path.join(featurePath, 'index.ts')).href);
    
            if (featuresModule.default && Array.isArray(featuresModule.default)) {
                for (const feature of featuresModule.default) {
                    await this.loadFeature(feature);
                }
            } else {
                console.log("No valid features found in index.ts");
            }
        } catch (error) {
            console.error("Error loading features:", error);
        }
    }
    
    /**
     * Loads a single feature.
     * @param feature The feature to load.
     */
    public async loadFeature(feature: any): Promise<void> {
        if (typeof feature !== 'object' || feature === null) {
            console.error(`Feature is not a valid object:`, feature);
            return;
        }
    
        console.log('Loading feature:', feature.featureId);
    
        if (typeof feature.featureId !== 'number' || isNaN(feature.featureId)) {
            console.error(`Invalid featureId for feature:`, feature);
            return;
        }
    
        const featureId = feature.featureId;
        this.features[featureId] = feature;
    }

    /**
     * Connects to the Discord bot if all environment variables are present.
     */
    private async connectDiscord(): Promise<void> {
        if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CHANNEL_ID || !process.env.DISCORD_COMMAND_CHANNEL_ID) {
            console.error("Missing Discord environment variables");
            return;
        }

        try {
            this.discord = new ServiceDiscord(
                this,
                process.env.DISCORD_TOKEN,
                process.env.DISCORD_CLIENT_ID,
                process.env.DISCORD_CHANNEL_ID,
                process.env.DISCORD_COMMAND_CHANNEL_ID
            );   
        } catch (error) {
            console.error("Failed to initialize Discord:", error);
        }
    }

    /**
     * Connects to the data stream server.
     */
    private async connectDataStreamServer(filters: Partial<IMessage> = {}): Promise<void> {
        if (!process.env.DATA_STREAM_PORT) {
            console.log("Missing data stream port environment variable");
        } else {
            this.dataStreamServer = new DataStreamServer(parseInt(process.env.DATA_STREAM_PORT), filters);
            this.dataStreamServer.start();
        }
    }

    /**
     * Handles incoming messages from the P2P network, processes them based on the topic.
     * @param topic The topic of the message.
     * @param message The message to process.
     */    
    private async handleMessage(topic: string, message: IMessage): Promise<void> {
        logTraffic(message);
        this.sendDiscord(message);
        this.sendDataStream(message);

        if (message.type === 'PENALTY:CHAINMISS') return;
        if (this.drivers[message.source!] === undefined) {
            if (message.source == 1010101010) return;
            message.type = 'PENALTY:CHAINMISS';
            message.author = this.nodePublicKey;
            this.sendMessage(message);
            return;
        }
        const driver = this.drivers[message.source!];
    
        if (topic === 'MESSAGE:REQUEST') {
            if (message.featureId !== undefined) {
                message.type = 'FEATURE:START';
                message.author = this.nodePublicKey;
                this.sendMessage(message);

                try {
                    if (this.features[message.featureId] === undefined) {
                        console.log('feature not found', message.featureId);
                        message.featureFailed = true;
                    } else {
                        message = await this.features[message.featureId].process(driver, message);
                    }

                    if (message.featureFailed) {
                        message.type = 'FEATURE:FAILED';
                        message.author = this.nodePublicKey;
                        this.sendMessage(message);
                        return;
                    }

                    message.type = 'FEATURE:COMPLETED';
                    message.author = this.nodePublicKey;
                    this.sendMessage(message);
                } catch (err) {
                    console.log('error processing feature', err);
                    message.type = 'FEATURE:FAILED';
                    message.author = this.nodePublicKey;
                    this.sendMessage(message);
                    return;
                }
            }

            driver.processMessageRequest(message);
        }
    }

    /**
     * Loads chain-specific drivers based on the provided configuration.
     */    
    private async loadChainDrivers(): Promise<void> {
        Object.entries(this.config).forEach(([networkId, chainConfig]) => {
            console.log('Loading driver for', chainConfig.name, `(${chainConfig.id})`);
            
            const chainId = parseInt(chainConfig.id);
            switch(chainConfig.type) {
                case 'EVMMV3': this.drivers[chainId] = new DriverEVM(this, chainId); break;
                case 'Reef': this.drivers[chainId] = new DriverReef(this, chainId); break;
                default: console.log('unknown driver type', chainConfig.type); return;
            }

            this.drivers[chainId].connect(chainConfig);
        });
    }

    /**
     * Sends a message using the P2P network.
     * @param message The message to be sent, conforming to the IMessage interface.
     */    
    async sendMessage(message: IMessage): Promise<void> {
        await this.p2pService.sendMessage(message);
    }

    /**
     * Sends a message or notification to Discord.
     * @param message The message or notification to send.
     */    
    async sendDiscord(message: IMessage | string): Promise<void> {
        if (!this.discord) return;
        await this.discord.sendDiscordMessage(message);
    }

    /**
     * Sends a message to the data stream server.
     * @param message The message to send.
     */
    async sendDataStream(message: IMessage): Promise<void> {
        if (!this.dataStreamServer) return;
        this.dataStreamServer.sendData(message);
    }

    async sendDataStreamRaw(message: any): Promise<void> {
        if (!this.dataStreamServer) return;
        this.dataStreamServer.sendDataRaw(message);
    }
}
