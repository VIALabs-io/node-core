// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { ethers } from "ethers";
import { IVladiator } from "../types/IVladiator.js";
import { IMessage } from "../types/IMessage.js";
import { logDebug } from "../utils/logDebug.js";
import { IDriverBase } from "../types/IDriverBase.js";
import { Provider } from "@reef-chain/evm-provider";

/**
 * Abstract base class for all driver types within the VIA Labs system, providing a common framework for interacting with different blockchains.
 */
abstract class DriverBase implements IDriverBase {
    protected nodePrivateKey!: string;  // Private key of the node for signing transactions.
    protected nodePublicKey!: string;   // Public key of the node corresponding to the private key.
    protected signatures: Record<string, string> = {};  // Cache for signatures to prevent reprocessing.
    protected featureReplies: Record<string, string> = {};  // Cache for feature replies from project nodes
    public nodeSigner!: ethers.Wallet;  // Ethers.js wallet instance for the node.
    public chainId: number;             // Chain ID associated with the driver instance.
    public provider!: ethers.providers.JsonRpcProvider | Provider; // Ethers provider for interacting with the blockchain.
    public vladiator: IVladiator;       // Reference to the main Vladiator instance managing this driver.

    /**
     * Constructs a new DriverBase instance.
     * @param vladiator Reference to the main Vladiator instance.
     * @param chainId Blockchain chain ID that this driver will interact with.
     */
    constructor(vladiator: IVladiator, chainId: number) {
        this.nodePrivateKey = vladiator.nodePrivateKey;
        this.vladiator      = vladiator;
        this.chainId        = chainId;
        this.nodeSigner     = new ethers.Wallet(this.nodePrivateKey);
        this.nodePublicKey  = this.nodeSigner.address;
    }

    /**
     * Connects to the blockchain node using the specified RPC address.
     * @param rpcAddress The RPC URL to connect to.
     */
    abstract connect(rpcAddress: string): Promise<void>;

    /**
     * Validates a message against the blockchain's state to ensure it's correct and can be processed.
     * @param message The message to validate.
     */
    abstract isMessageValid(message: IMessage): Promise<boolean>;

    /**
     * Checks if the message has already been processed to prevent duplicate processing.
     * @param message The message to check.
     */
    abstract isMessageProcessed(message: IMessage): Promise<boolean>;

    /**
     * Populates additional message details based on data retrieved from the blockchain.
     * @param message The initial message requiring enrichment from blockchain data.
     */
    abstract populateMessage(message: IMessage): Promise<IMessage>;

    /**
     * Retrieves the external signature for a given project, facilitating cross-chain operations.
     * @param recipient The recipient or project identifier to retrieve the signature for.
     */
    abstract getExsig(recipient: string): Promise<string>;

    /**
     * Retrieves the chain signature that identifies the node's signing authority within the network.
     */
    abstract getChainsig(): Promise<string>;

    /**
     * Processes an incoming message request, managing locking, validation, and potential re-signing.
     * @param message The incoming message to process.
     */
    async processMessageRequest(message: IMessage): Promise<void> {
        if(message.transactionHash === undefined) return;
        if(message.values === undefined) return;

        if(typeof(this.signatures[message.values.txId]) !== 'undefined') {
            // we have seen this request before
            if(this.signatures[message.values.txId] === "locked") {
                // we are still working on it
            } else {
                // we have a signature, lets send it
                message.type   = 'MESSAGE:SIGNED';
                message.author = this.nodePublicKey;
                message.signature = this.signatures[message.values.txId];
                message.signer = this.nodeSigner.address;
                if(this.featureReplies[message.values.txId] !== undefined) {
                    message.featureReply = this.featureReplies[message.values.txId];
                }
                this.vladiator.sendMessage(message);
            }
            return;
        }

        // lock this thread, we're processing it
        this.signatures[message.values.txId] = "locked";

        const destChainId = Number(message.values.chain);
        const destDriver = this.vladiator.drivers[destChainId];

        // repopulate message variables from on-chain data for this transaction hash
        // do not -rely- on request data sent from p2p network
        try {
            message = await this.populateMessage(message);
            if(message.values === undefined || message.transactionHash === undefined) {
                logDebug(this.chainId, 'no values for ' + message.transactionHash);
                return;
            }
        } catch(err) {
            logDebug(this.chainId, 'error populating message ' + message.transactionHash);
            return;
        }

        // check message and sign it if valid
        if(await this.isMessageValid(message)) {
            if (!destDriver) {
                message.type = 'PENALTY:CHAINMISS';
                message.author = this.nodePublicKey;
                this.vladiator.sendMessage(message);
                return;
            }

            // process any features

            if(message.featureId !== undefined) {
                logDebug(this.chainId, 'feature start ('+message.featureId+') ' + message.transactionHash + ' ' + message.values.txId);

                message.type   = 'FEATURE:START';
                message.author = this.nodePublicKey;
                this.vladiator.sendMessage(message);

                try {
                    message = await this.processFeatures(message);
                    if(message.transactionHash === undefined || message.values === undefined || message.featureFailed === true) {
                        throw new Error('feature failed');
                    } else {
                        if(message.featureReply !== undefined) {
                            this.featureReplies[message.values.txId] = message.featureReply;
                        }
                    }
                } catch(err) {
                    logDebug(this.chainId, 'error processing feature ' + message.transactionHash);
                    message.type   = 'FEATURE:FAILED';
                    message.author = this.nodePublicKey;
                    this.vladiator.sendMessage(message);
                    return;
                }

                message.type   = 'FEATURE:COMPLETED';
                message.author = this.nodePublicKey;
                this.vladiator.sendMessage(message);
                logDebug(this.chainId, 'feature complete' + message.transactionHash + ' ' + message.values.txId);
            } else {
                logDebug(this.chainId, 'no feature ' + message.transactionHash + ' ' + message.values.txId);
            }

            this.signatures[message.values.txId] = await this.vladiator.drivers[message.values!.chain].signTransactionData({
                txId: message.values.txId,
                sourceChainId: this.chainId,
                destChainId: message.values.chain,
                sender: message.values.sender,
                recipient: message.values.recipient,
                data: message.values.encodedData
            });

            // send message if we have a good signature
            if(this.signatures[message.values.txId]) {
                message.type   = 'MESSAGE:SIGNED';
                message.author = this.nodePublicKey;
                message.signer = this.nodeSigner.address;
                message.signature = this.signatures[message.values.txId];
                this.vladiator.sendMessage(message);
            }
        } else {
            // invalid message
            message.type = 'MESSAGE:INVALID';
            message.author = this.nodePublicKey;
            this.vladiator.sendMessage(message);
        }
    }

    /**
     * Signs transaction data using the node's private key.
     * @param txData The transaction data to sign.
     */
    async signTransactionData(txData: {
        txId: ethers.BigNumberish,
        sourceChainId: ethers.BigNumberish,
        destChainId: ethers.BigNumberish,
        sender: string,
        recipient: string,
        data: string
    }): Promise<string> {
        const messageHash = ethers.utils.defaultAbiCoder.encode(
            ["uint256", "uint256", "uint256", "address", "address", "bytes"],
            [txData.txId, txData.sourceChainId, txData.destChainId, txData.sender, txData.recipient, txData.data]

        );
        const signature = await this.nodeSigner.signMessage(ethers.utils.arrayify(ethers.utils.keccak256(messageHash)));
        logDebug(this.chainId, 'signed ' + txData.txId + ' ' + signature);

        return signature;
    }

    /**
     * Processes features attached to a message by triggering specific operations defined in the feature set.
     * @param message The message containing feature requests.
     */
    private async processFeatures(message: IMessage): Promise<IMessage> {
        try {
            if(this.vladiator.features[message.featureId!] === undefined) {
                console.log(this.vladiator.features);
                logDebug(this.chainId, 'feature not found ' + message.featureId);
                return message;
            }

            logDebug(this.chainId, 'processing feature ' + message.featureId);
            return this.vladiator.features[message.featureId!].process(this, message);
        } catch(err) {
            console.log('error processing feature', err);
            message.featureFailed = true;
            return message;
        }
    }

    /**
     * Utility method to delay execution within the async functions.
     * @param ms Milliseconds to delay.
     */
    public async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }  
}
export default DriverBase;