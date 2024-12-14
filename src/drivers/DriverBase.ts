// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { ethers } from "ethers";
import { IVladiator } from "../types/IVladiator.js";
import { IMessage } from "../types/IMessage.js";
import { logDebug } from "../utils/logDebug.js";
import { NetworkConfig } from "../types/IChainConfig.js";
import { Signer } from '@reef-chain/evm-provider';

/**
 * Abstract base class for all driver types within the VIA Labs system, providing a common framework for interacting with different blockchains.
 */
abstract class DriverBase {
    public nodeSigner!: ethers.Wallet | (Signer & {address: string});
    protected nodePrivateKey!: string;
    protected nodePublicKey!: string;
    protected signatures: Record<string, string> = {};
    protected featureReplies: Record<string, string> = {};
    protected retries: Record<string, number> = {};
    public chainId: number;
    public provider!: any;
    public vladiator: IVladiator;

    /**
     * Constructs a new DriverBase instance.
     * @param vladiator Reference to the main Vladiator instance.
     * @param chainId Blockchain chain ID that this driver will interact with.
     */
    constructor(vladiator: IVladiator, chainId: number) {
        this.nodePrivateKey = vladiator.nodePrivateKey;
        this.vladiator = vladiator;
        this.chainId = chainId;
        this.nodeSigner = new ethers.Wallet(this.nodePrivateKey);
        this.nodePublicKey = this.nodeSigner.address;
    }

    /**
     * Connects to the blockchain node using the specified configuration.
     * @param chainConfig The chain configuration containing connection details.
     */
    abstract connect(chainConfig: NetworkConfig): Promise<void>;

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
     * Retrieves the external signature for a given project, facilitating cross-chain operations.
     * @param recipient The recipient or project identifier to retrieve the signature for.
     */
    abstract getExsig(recipient: string): Promise<string>;

    /**
     * Retrieves the chain signature that identifies the node's signing authority within the network.
     */
    abstract getChainsig(): Promise<string>;

    /**
     * Processes an incoming message request, managing validation and signing.
     * @param message The incoming message to process.
     */
    async processMessageRequest(message: IMessage): Promise<void> {
        if (message.transactionHash === undefined) return;
        if (message.values === undefined) return;

        if (typeof (this.signatures[message.values.txId]) !== 'undefined') {
            // we have seen this request before
            if (this.signatures[message.values.txId] === "locked") {
                // we are still working on it
            } else {
                // we have a signature, lets send it
                message.type = 'MESSAGE:SIGNED';
                message.author = this.nodePublicKey;
                message.signer = this.nodeSigner.address;
                message.signature = this.signatures[message.values.txId];
                this.vladiator.sendMessage(message);
            }
            return;
        }

        this.retries[message.values.txId] = (this.retries[message.values.txId] || 0) + 1;
        if (this.retries[message.values.txId] > 3) {
            return;
        }

        // lock this thread, we're processing it
        this.signatures[message.values.txId] = "locked";

        const destChainId = Number(message.values.chain);
        const destDriver = this.vladiator.drivers[destChainId];

        // check message and sign it if valid
        if (await this.vladiator.drivers[message.source!].isMessageValid(message)) {
            if (!destDriver) {
                logDebug(this.chainId, 'no driver for ' + message.values!.chain);
                return;
            }

            this.signatures[message.values.txId] = await this.vladiator.drivers[Number(message.values!.chain)].signTransactionData({
                txId: message.values.txId,
                sourceChainId: this.chainId,
                destChainId: message.values.chain,
                sender: message.values.sender,
                recipient: message.values.recipient,
                data: message.values.encodedData
            });

            // send message if we have a good signature
            if (this.signatures[message.values.txId]) {
                message.type = 'MESSAGE:SIGNED';
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
            logDebug(this.chainId, 'invalid message - this should be penalty tattle');
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
     * Splits a signature into its r, s, and v components.
     * @param signature The signature to split.
     */
    public splitSignature(signature: string): { r: string, s: string, v: number } | boolean {
        if (!signature.startsWith('0x') || signature.length !== 132) {
            return false;
        }

        const signatureNoPrefix = signature.slice(2);
        const r = '0x' + signatureNoPrefix.slice(0, 64);
        const s = '0x' + signatureNoPrefix.slice(64, 128);
        const v = parseInt(signatureNoPrefix.slice(128, 130), 16);

        const adjustedV = [27, 28].includes(v) ? v : v + 27;

        return { r, s, v: adjustedV };
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
