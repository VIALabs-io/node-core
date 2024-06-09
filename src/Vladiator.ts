// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { EventEmitter } from "events";
import { createLibp2p, Libp2p } from "libp2p";
import { tcp } from "@libp2p/tcp";
import { noise } from "@chainsafe/libp2p-noise";
import { mplex } from "@libp2p/mplex";
import { gossipsub } from "@chainsafe/libp2p-gossipsub";
import { bootstrap } from "@libp2p/bootstrap";
import { IChainConfig } from "./types/IChainConfig.js";
import { logTraffic } from "./utils/logTraffic.js";
import { IVladiator } from "./types/IVladiator.js";
import { IMessage } from "./types/IMessage.js";
import Discord from "./DiscordHandler.js";
import DriverBase from "./drivers/DriverBase.js";
import DriverEVM from "./drivers/DriverEVM.js";
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
export class Vladiator extends EventEmitter implements IVladiator {
    public nodePrivateKey: string;
    public nodePublicKey: string;
    public drivers: { [chainId: number]: DriverBase } = {};
    public discord!: Discord;
    public dataStreamServer!: DataStreamServer;
    public features: { [featureId: string]: any } = {};
    private network!: Libp2p;
    private config: IChainConfig;

    /**
     * Initializes Vladiator with necessary configuration and private keys.
     * @param nodePrivateKey Private key for the node.
     * @param config Configuration object containing network settings.
     */
    constructor(nodePrivateKey: string, config: IChainConfig) {
        super();
        this.nodePrivateKey = nodePrivateKey;
        this.nodePublicKey = process.env.NODE_PUBLIC_KEY || '';
        this.config = config;
        this.initialize().catch(error => {
            console.error("Failed to initialize:", error);
            process.exit(1);
        });
    }

    /**
     * Starts the initialization process for Discord, P2P, and chain drivers.
     */
    private async initialize(): Promise<void> {
        await this.connectDiscord();
        await this.connectDataStreamServer();
        await this.connectP2P();
        await this.loadChainDrivers();
        await this.loadFeatureDirectory();

        this.emit('ready');

        setInterval(() => {
            this.sendHeartbeat();
        }, 2 * 60 * 1000);
    }

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
     * Establishes the P2P connections and setups libp2p network.
     */
    private async connectP2P(): Promise<void> {
        const bootstrapers = [
            '/ip4/162.19.205.208/tcp/50111/p2p/16Uiu2HAm8mUGETqTjHMTSc2WK3c8gBR8qqSXYMN61AWKKEsfVnu4'
        ];

        this.network = await createLibp2p({
            addresses: {
                listen: [`/ip4/0.0.0.0/tcp/0`],
            },
            transports: [tcp()],
            connectionEncryption: [noise()],
            streamMuxers: [mplex()],
            peerDiscovery: [
                bootstrap({ list: bootstrapers })
            ],
            pubsub: gossipsub({ emitSelf: true, enabled: true }),
            connectionManager: {
                autoDial: true,
                maxConnections: 1024,
            },
            relay: {
                enabled: true,
                hop: {
                    enabled: true,
                    active: true,
                },
            },
        });

        await this.network.start();
        
        this.network.getMultiaddrs().forEach((addr:any) => {
            console.log('listening on addresses:', addr.toString())
        })

        this.network.addEventListener('peer:discovery', (evt:any) => {
            const peer = evt.detail;
            console.log('Discovered:', peer.id, peer.multiaddrs[0]);
        });

        this.network.addEventListener('peer:connect', (evt:any) => {
            const peer = evt.detail;
            console.log('Connect:', peer.remotePeer, peer.remoteAddr);
        });

        this.network.addEventListener('peer:disconnect', (evt:any) => {
            const peer = evt.detail;
            console.log('Disconnect:', peer.remotePeer, peer.remoteAddr);
        });

        this.subscribeToTopics();
    }

    /**
     * Connects to the Discord bot if all environment variables are present.
     */
    private async connectDiscord(): Promise<void> {
        if(!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CHANNEL_ID || !process.env.DISCORD_COMMAND_CHANNEL_ID) {
            console.error("Missing Discord environment variables");
            return;
        }

        try {
            this.discord = new Discord(
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
    private async connectDataStreamServer(): Promise<void> {
        if(!process.env.DATA_STREAM_PORT) {
            console.log("Missing data stream port environment variable");
        } else {
            this.dataStreamServer = new DataStreamServer(parseInt(process.env.DATA_STREAM_PORT));
            this.dataStreamServer.start();
        }
    }

    /**
     * Subscribes to various topics on the P2P network.
     */
    private async subscribeToTopics(): Promise<void> {
        const topics = [
            'HEARTBEAT',
            'MESSAGE:REQUEST',
            'MESSAGE:SIGNED',
            'MESSAGE:QUEUED',
            'MESSAGE:EXECUTION',
            'MESSAGE:INVALID',
            'FEATURE:START',
            'FEATURE:FAILED',
            'FEATURE:COMPLETED',
        ];

        topics.forEach(topic => {
            this.network.pubsub.subscribe(topic);
        });

        this.network.pubsub.addEventListener('message', async (evt) => {
            const { topic, data } = evt.detail;
            this.handleMessage(topic, data);
        });
    }

    /**
     * Handles incoming messages from the P2P network, processes them based on the topic.
     * @param topic The topic of the message.
     * @param data The data of the message, typically a serialized IMessage object.
     */    
    private async handleMessage(topic: string, data: Uint8Array): Promise<void> {
        if (topic === '_peer-discovery._p2p._pubsub') return;
    
        let message: IMessage;
        try {
            message = JSON.parse(new TextDecoder().decode(data));
        } catch (e) {
            console.log(e);
            console.log(data.toString());
            return;
        }

        logTraffic(message);
        this.emit('message', message);
        if(message.values) this.emit(message.values?.txId, message);
        this.sendDiscord(message);
        this.sendDataStream(message);

        if(this.drivers[message.source!] === undefined) return;
        const driver = this.drivers[message.source!];
    
        if(topic === 'MESSAGE:REQUEST') driver.processMessageRequest(message);
    }

    /**
     * Loads chain-specific drivers based on the provided configuration.
     */    
    private async loadChainDrivers(): Promise<void> {
        Object.entries(this.config).forEach(([, chainConfig]) => {
            console.log('Loading driver for', chainConfig.name, `(${chainConfig.id})`);
            
            const chainId = parseInt(chainConfig.id);
            switch(chainConfig.type) {
                case 'EVMMV3': this.drivers[chainId] = new DriverEVM(this, chainId); break;
                default: console.log('unknown driver type', chainConfig.type); return;
            }

            this.drivers[chainId].connect(chainConfig.rpc);
        });
    }

    /**
     * Sends a message using the P2P network.
     * @param message The message to be sent, conforming to the IMessage interface.
     */    
    async sendMessage(message: IMessage): Promise<void> {
        const messageData = Buffer.from(JSON.stringify(message));
    
        try {
            this.network.pubsub.publish(message.type, messageData);
        } catch (error) {
            console.error(`Failed to publish message of type '${message.type}':`, error);
        }
    }

    /**
     * Sends a message or notification to Discord.
     * @param message The message or notification to send.
     */    
    async sendDiscord(message: IMessage | string): Promise<void> {
        if (!this.discord) return;
        this.discord.send(message);
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

    /**
     * Periodically sends a heartbeat message across the network.
     */    
    async sendHeartbeat() {
        const status: string[] = [
            "Recursion: see Recursion.",
            "This line is gluten-free.",
            "Variable but not moody.",
            "Schrodinger's bug detected.",
            "Commit denied: too punny.",
            "I told you so, signed: Compiler.",
            "Array starts at 0.5 for optimism.",
            "Coders' mantra: It works, but don't touch it.",
            "Stack Overflow is my rubber duck.",
            "In case of fire: git commit, git push, exit building.",
            "Programmer's diet: coffee, cookies, and (clear)cache.",
            "404: Programmer not found.",
            "I've got a joke on UDP, but you might not get it.",
            "An SQL query walks into a bar, joins two tables and leaves.",
            "I would tell an IPv4 joke, but the good ones are all taken.",
            "My software never has bugs, it just develops random features.",
            "Why do programmers prefer dark mode? Because light attracts bugs.",
            "I don't see women as objects. I consider each to be in a class of her own.",
            "A programmer's wife tells him: 'Buy a loaf of bread. If they have eggs, buy a dozen.' He came back with 12 loaves.",
            "To understand what recursion is, you must first understand recursion.",
            "You had me at 'Hello World.'",
            "Machine learning in a nutshell: if it works, it's AI; if not, it's ML.",
            "2B OR NOT 2B? - That's FF.",
            "Why did the programmer quit his job? Because he didn't get arrays.",
            "Old programmers never die. They just decompile.",
            "I've got a really good UDP joke to tell you but I don't know if you'll get it.",
            "A byte walks into a bar looking for a bit.",
            "I'd tell you a concurrency joke, but it might take too long to get it.",
            "I love pressing F5. It's so refreshing.",
            "Why do programmers hate nature? It has too many bugs.",
            "Why do programmers like UNIX? It gives them more 'grep'.",
            "A SQL statement walks into a bar and sees two tables. It approaches and asks, 'Mind if I join you?'",
            "When your hammer is C++, everything begins to look like a thumb.",
            "A programmer had a problem. He thought to himself, 'I know, I'll solve it with threads!' has Now problems. two he",
            "Keyboard not responding. Press any key to continue.",
            "How does a programmer open a jar for his girlfriend? He installs Java.",
            "How many programmers does it take to change a light bulb? None, that's a hardware issue.",
            "Why was the JavaScript developer sad? Because he didn't Node how to Express himself.",
            "There is a band called 1023MB. They haven't had any gigs yet.",
            "Why do Java developers wear glasses? Because they don't C#.",
            "What's the object-oriented way to become wealthy? Inheritance.",
            "Why did the developer go broke? Because he used up all his cache.",
            "How do you comfort a JavaScript bug? You console it.",
            "A UDP packet walks into a bar, the bartender doesn't acknowledge him.",
            "I'd tell you a joke about git, but the punchline is too long to merge.",
            "Why don't bachelors like Git? Because they are afraid to commit.",
            "A user interface is like a joke. If you have to explain it, it's not that good.",
            "What's a programmer's favorite hangout place? Foo Bar.",
            "Algorithm: a word used by programmers when they do not want to explain what they did.",
            "Software and cathedrals are much the same - first we build them, then we pray.",
            "There's no place like 127.0.0.1.",
            "How many programmers does it take to kill a cockroach? Two: one holds, the other installs Windows on it.",
            "Programming is like sex: One mistake and you have to support it for the rest of your life.",
            "Why do programmers prefer using dark mode? Because light attracts bugs.",
            "Debugging: Being the detective in a crime movie where you are also the murderer.",
            "Code never lies, comments sometimes do.",
            "Why do programmers always mix up Christmas and Halloween? Because Oct 31 == Dec 25.",
            "What's the best thing about Boolean logic? Even if you're wrong, you're only off by a bit.",
            "A good programmer is someone who looks both ways before crossing a one-way street.",
            "Front-end developers do it with <style>.",
            "Why was the function a bad friend? It always left without saying goodbye.",
            "If debugging is the process of removing bugs, then programming must be the process of putting them in.",
            "Why did the programmer leave the restaurant? Because the pizza delivery API wasn't RESTful.",
            "How do you check if a webpage is HTML5? Try it out on Internet Explorer."
        ];
                
        const index = Math.floor(Math.random() * status.length);
        this.sendMessage({type: 'HEARTBEAT', source: 1010101010, author: this.nodePublicKey, transactionHash: status[index]});
    }
}
