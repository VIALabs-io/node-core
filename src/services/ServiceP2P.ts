import { createLibp2p, Libp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { bootstrap } from '@libp2p/bootstrap'
import { identify } from '@libp2p/identify'
import { kadDHT } from '@libp2p/kad-dht'
import { IMessage } from "../types/IMessage.js"
import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from '@libp2p/crypto/keys'
import type { PrivateKey } from '@libp2p/interface'
import { multiaddr, type Multiaddr } from '@multiformats/multiaddr'

// Enable libp2p debug logs only if DEBUG is true
if (process.env.DEBUG === 'true') {
    process.env.DEBUG = 'libp2p:*,libp2p:websockets*,libp2p:dialer*,libp2p:connection*'
}

// Polyfill for CustomEvent if it's not available
if (typeof CustomEvent === 'undefined') {
    (global as any).CustomEvent = class CustomEvent<T> extends Event {
        public detail: T;
        constructor(type: string, eventInitDict?: CustomEventInit<T>) {
            super(type, eventInitDict);
            this.detail = eventInitDict?.detail as T;
        }
    };
}

interface RecentMessage {
    timestamp: number;
    author: string;
    transactionHash: string;
    type: string;
}

export class ServiceP2P {
    private libp2p!: Libp2p
    private debug: boolean
    private recentMessages: RecentMessage[] = []

    constructor(private messageHandler: (topic: string, message: IMessage) => void) {
        this.debug = process.env.DEBUG === 'true'
    }

    private log(...args: any[]): void {
        if (this.debug) {
            console.log(...args)
        }
    }

    private logError(...args: any[]): void {
        if (this.debug) {
            console.error(...args)
        }
    }

    private getPortFromAnnounceAddress(): number {
        if (process.env.ANNOUNCE_ADDRESS) {
            const match = process.env.ANNOUNCE_ADDRESS.match(/\/tcp\/(\d+)/)
            if (match && match[1]) {
                return parseInt(match[1], 10)
            }
        }
        return 23771 // Default WebSocket port
    }

    async connect(): Promise<void> {
        try {
            const isBootNode = process.env.BOOTNODE === 'true'
            let bootstrapers: string[] = []

            if (process.env.BOOTSTRAP_PEERS) {
                // Split peers by comma and process each one
                const peerAddrs = process.env.BOOTSTRAP_PEERS.split(',').map(addr => addr.trim())
                
                for (const peerAddr of peerAddrs) {
                    try {
                        // Parse into multiaddr to validate
                        const addr = multiaddr(peerAddr)
                        // Get the parts
                        const parts = addr.toString().split('/p2p/')
                        if (parts.length > 2) {
                            // If there are multiple /p2p/ parts, take only up to the first peer ID
                            bootstrapers.push(`${parts[0]}/p2p/${parts[1]}`)
                        } else {
                            bootstrapers.push(addr.toString())
                        }
                    } catch (err) {
                        this.logError('Invalid bootstrap peer address:', peerAddr, err)
                    }
                }
                this.log('Bootstrap peers:', bootstrapers)
            }

            // Use configured port for WebSocket and port+1 for TCP
            const wsPort = isBootNode ? this.getPortFromAnnounceAddress() : 0
            const tcpPort = isBootNode ? wsPort + 1 : 0

            const listenAddresses = [
                `/ip4/0.0.0.0/tcp/${tcpPort}`,          // TCP listener
                `/ip4/0.0.0.0/tcp/${wsPort}/ws`         // WebSocket listener
            ]

            let privateKey: PrivateKey;
            if (process.env.P2P_PRIVATE_KEY) {
                const privateKeyBuffer = Buffer.from(process.env.P2P_PRIVATE_KEY, 'base64')
                privateKey = privateKeyFromProtobuf(privateKeyBuffer)
            } else {
                console.log('Generating new Secp256k1 private key...')
                privateKey = await generateKeyPair('secp256k1')
                const privateKeyProtobuf = privateKeyToProtobuf(privateKey)
                const privateKeyBase64 = Buffer.from(privateKeyProtobuf).toString('base64')
                console.log('New Private Key (base64):', privateKeyBase64)
                console.log('Add this to your .env file as P2P_PRIVATE_KEY=', privateKeyBase64)
            }

            // Handle announce addresses for bootnode
            let announceAddresses: string[] | undefined
            if (isBootNode && process.env.ANNOUNCE_ADDRESS) {
                const baseAddr = process.env.ANNOUNCE_ADDRESS.replace('/ws', '')
                announceAddresses = [
                    process.env.ANNOUNCE_ADDRESS,                    // WebSocket address
                    `${baseAddr.replace(/\/tcp\/\d+/, `/tcp/${tcpPort}`)}` // TCP address
                ]
            }

            const node = await createLibp2p({
                addresses: {
                    listen: listenAddresses,
                    announce: announceAddresses
                },
                transports: [
                    tcp(),
                    webSockets()
                ],
                connectionEncrypters: [noise()],
                streamMuxers: [yamux()],
                peerDiscovery: bootstrapers.length > 0 ? [
                    bootstrap({
                        list: bootstrapers,
                        timeout: 30000,
                        tagName: 'bootstrap',
                        tagValue: 50,
                        tagTTL: Infinity
                    })
                ] : [],
                services: {
                    identify: identify(),
                    pubsub: gossipsub({
                        emitSelf: true,
                        fallbackToFloodsub: true,
                        floodPublish: true,
                        allowPublishToZeroTopicPeers: true,
                        heartbeatInterval: 1000
                    }),
                    dht: kadDHT({
                        clientMode: !isBootNode,
                        kBucketSize: 20
                    })
                },
                connectionManager: {
                    maxConnections: 50
                },
                privateKey
            })

            this.libp2p = node
            this.setupEventListeners()

            try {
                await this.libp2p.start()
                this.log('libp2p node started successfully')

                this.libp2p.getMultiaddrs().forEach((addr) => {
                    this.log('listening on addresses:', addr.toString())
                })

                this.subscribeToTopics()

                if (isBootNode) {
                    const multiaddr = this.getBootstrapMultiaddr()
                    this.log('Bootnode multiaddr:', multiaddr)
                }

                // Monitor connection status
                setInterval(() => {
                    this.reconnectBootstrap(bootstrapers);
                }, 30000);
                this.reconnectBootstrap(bootstrapers);

            } catch (error) {
                this.logError('Failed to start libp2p node:', error)
                throw error
            }

        } catch (error) {
            this.logError('Error in connect method:', error)
            throw error // Re-throw to allow proper error handling by caller
        }
    }

    private reconnectBootstrap(bootstrapers: string[]) {
        const connections = this.libp2p.getConnections()
        const ownPeerId = this.libp2p.peerId.toString()
        if (bootstrapers.length > 0) {
            bootstrapers.forEach(addr => {
                try {
                    const ma = multiaddr(addr)
                    const peerId = ma.getPeerId()
                    
                    // Check if this is not our own peer ID and if we're not already connected
                    if (peerId && peerId !== ownPeerId) {
                        const isConnected = connections.some(conn => conn.remotePeer.toString() === peerId)
                        
                        if (!isConnected) {
                            this.libp2p.dial(ma).catch(err => {
                                this.logError('Failed to dial bootstrap peer:', err.message)
                            })
                        }
                    }
                } catch (err) {
                    this.logError('Invalid multiaddr:', err)
                }
            })
        }
    }

    private setupEventListeners(): void {
        this.libp2p.addEventListener('peer:discovery', (evt: CustomEvent<any>) => {
            try {
                const peerInfo = evt.detail
                this.log('Discovered:', peerInfo.id.toString())
                this.log('Multiaddrs:', peerInfo.multiaddrs.map((ma: any) => ma.toString()))
            } catch (error) {
                this.logError('Error in peer:discovery event:', error)
            }
        })

        this.libp2p.addEventListener('peer:connect', (evt: CustomEvent<any>) => {
            try {
                const connection = evt.detail
                if (connection && connection.remotePeer) {
                    this.log('Connected to:', connection.remotePeer.toString())
                } else {
                    this.log('Connected to peer')
                }
            } catch (error) {
                this.logError('Error in peer:connect event:', error)
            }
        })

        this.libp2p.addEventListener('peer:disconnect', (evt: CustomEvent<any>) => {
            try {
                const connection = evt.detail
                if (connection && connection.remotePeer) {
                    this.log('Disconnected from:', connection.remotePeer.toString())
                } else {
                    this.log('Disconnected from peer')
                }
            } catch (error) {
                this.logError('Error in peer:disconnect event:', error)
            }
        })
    }

    private subscribeToTopics(): void {
        const topics = [
            'HEARTBEAT',
            'MESSAGE:REQUEST',
            'MESSAGE:SIGNED',
            'MESSAGE:QUEUED',
            'MESSAGE:EXECUTION',
            'MESSAGE:EXISTS',
            'MESSAGE:INVALID',
            'MESSAGE:RESET',
            'FEATURE:START',
            'FEATURE:FAILED',
            'PENALTY:CHAINMISS',
            'PENALTY:TATTLE',
            'PENALTY:SIGNED',
            'PENALTY:EXECUTION',
        ]

        topics.forEach(topic => {
            try {
                (this.libp2p.services.pubsub as any).subscribe(topic)
            } catch (error) {
                this.logError(`Error subscribing to topic ${topic}:`, error)
            }
        })

        ;(this.libp2p.services.pubsub as any).addEventListener('message', (evt: CustomEvent<any>) => {
            try {
                const { topic, data } = evt.detail
                if (topic === '_peer-discovery._p2p._pubsub') return

                let message: IMessage
                try {
                    message = JSON.parse(new TextDecoder().decode(data))
                } catch (e) {
                    this.log('Error decoding message:', e)
                    this.log('Raw data:', data.toString())
                    return
                }

                this.handleMessage(topic, message)
            } catch (error) {
                this.logError('Error in pubsub message event:', error)
            }
        })
    }

    private handleMessage(topic: string, message: IMessage): void {
        const currentTime = Date.now()
        const transactionHash = message.transactionHash || ''
        const author = message.author || ''

        // Clean up old messages
        this.recentMessages = this.recentMessages.filter(m => currentTime - m.timestamp <= 5000)

        if (topic === 'MESSAGE:SIGNED' || topic === 'MESSAGE:REQUEST') {
            const isDuplicate = this.recentMessages.some(m => 
                m.type === topic &&
                m.author === author && 
                m.transactionHash === transactionHash && 
                (topic === 'MESSAGE:SIGNED' || (topic === 'MESSAGE:REQUEST' && currentTime - m.timestamp <= 5000))
            )

            if (isDuplicate) {
                //this.log(`Ignoring duplicate ${topic} from ${author} with hash ${transactionHash}`)
                return
            }

            this.recentMessages.push({ timestamp: currentTime, author, transactionHash, type: topic })
        }

        this.messageHandler(topic, message)
    }

    async sendMessage(message: IMessage): Promise<void> {
        try {
            const messageData = new TextEncoder().encode(JSON.stringify(message))
            await (this.libp2p.services.pubsub as any).publish(message.type, messageData)
        } catch (error) {
            this.logError(`Failed to publish message of type '${message.type}':`, error)
        }
    }

    getBootstrapMultiaddr(): string {
        try {
            // Get the first multiaddr that includes the peer ID
            const addr = this.libp2p.getMultiaddrs().find(addr => addr.toString().includes('/p2p/'))
            if (!addr) {
                throw new Error('No multiaddr with peer ID found')
            }
            return addr.toString()
        } catch (error) {
            this.logError('Error getting bootstrap multiaddr:', error)
            return ''
        }
    }
}
