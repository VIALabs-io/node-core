// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { ethers } from "ethers";
import { IMessage } from "./IMessage.js";
import { IVladiator } from "./IVladiator.js";

/**
 * Interface for DriverBase classes that manage blockchain interactions.
 * Provides the structure for connecting to blockchains, validating and processing messages,
 * handling transaction signatures, and interacting with blockchain-specific features.
 */
interface IDriverBase {
    nodeSigner: ethers.Wallet;
    chainId: number;
    provider: any;
    vladiator: IVladiator;

    /**
     * Connects to a blockchain using a specified RPC address.
     * @param rpcAddress The RPC URL to connect to the blockchain node.
     */
    connect(rpcAddress: string): Promise<void>;

    /**
     * Validates if a given message is correctly structured and safe to process.
     * @param message The message object to validate.
     */
    isMessageValid(message: IMessage): Promise<boolean>;

    /**
     * Checks if a given message has already been processed to avoid duplication.
     * @param message The message object to check.
     */
    isMessageProcessed(message: IMessage): Promise<boolean>;

    /**
     * Generates a signature specific to a recipient for transaction purposes.
     * @param recipient The recipient address used in the signature.
     */
    getExsig(recipient: string): Promise<string>;

    /**
     * Generates a signature that represents the chain-specific details.
     */
    getChainsig(): Promise<string>;

    /**
     * Processes a message request that involves checking its validity, processing any associated
     * features, and ultimately signing it if valid.
     * @param message The message object to process.
     */
    processMessageRequest(message: IMessage): Promise<void>;

    /**
     * Signs transaction data, creating a cryptographic signature that can be used to verify the
     * authenticity and integrity of a transaction on the blockchain.
     * @param txData The transaction data to sign.
     */
    signTransactionData(txData: {
        txId: ethers.BigNumberish,
        sourceChainId: ethers.BigNumberish,
        destChainId: ethers.BigNumberish,
        sender: string,
        recipient: string,
        data: string
    }): Promise<string>;

    /**
     * Utility function to pause execution for a set amount of time.
     * @param ms The number of milliseconds to delay.
     */
    delay(ms: number): Promise<void>;
}

export { IDriverBase }