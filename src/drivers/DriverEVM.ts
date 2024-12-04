// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { ethers } from "ethers";
import { IMessage } from "../types/IMessage.js";
// @ts-ignore
import { getChainConfig } from "@vialabs-io/npm-registry";
import DriverBase from "./DriverBase.js";
import { logDebug } from "../utils/logDebug.js";

/**
 * A blockchain driver for EVM-based chains with additional methods to handle message validation and processing.
 */
export default class DriverEVM extends DriverBase {
    public provider!: ethers.providers.JsonRpcProvider;  // JSON RPC provider for network interaction
    private contract!: ethers.Contract;  // Smart contract interaction handler
    private chainInterface = new ethers.utils.Interface([  // Interface for interpreting blockchain events and function calls
        "event SendRequested(uint txId, address sender, address recipient, uint chain, bool express, bytes data, uint16 confirmations)",
        "event SendProcessed(uint txId, uint sourceChainId, address sender, address recipient)",
        "event Success(uint txId, uint sourceChainId, address sender, address recipient, uint amount)",
        "event SetChainsig(address signer)",
        "function processedTransfers(uint txId) view returns (bool)",
        "function chainsig() view returns (address)",
        "function exsig(address project) view returns (address)"
    ]);
    private featureInterface = new ethers.utils.Interface([  // Interface for handling features related to blockchain transactions
        "function process(uint txId, uint sourceChainId, uint destChainId, address sender, address recipient, uint gas, uint32 featureId, bytes calldata featureReply, bytes[] calldata data) external",
        "event SendMessageWithFeature(uint txId, uint destinationChainId, uint32 featureId, bytes featureData)"
    ]);

    /**
     * Connects to the blockchain network using the provided RPC address.
     * 
     * @param rpcAddress - The RPC URL to connect to.
     */
    async connect(rpcAddress: string): Promise<void> {
        try {
            const chainConfig = getChainConfig(this.chainId);
            if (!chainConfig || !chainConfig.message) {
                throw new Error(`No chain config or message contract found for chainId ${this.chainId}`);
            }
            this.provider = new ethers.providers.StaticJsonRpcProvider(rpcAddress);
            this.contract = new ethers.Contract(chainConfig.message, this.chainInterface, this.provider);
        } catch (err) {
            console.log('error connecting to RPC for ' + this.chainId + ' (' + rpcAddress + ')')
            console.log(err);
        }
    }

    /**
     * Validates if a message from the blockchain is valid by checking the transaction receipt.
     * 
     * @param message - The message object containing transaction details.
     * @returns Promise that resolves to true if the message is valid, otherwise false.
     */
    async isMessageValid(message: IMessage): Promise<boolean> {
        try {
            if (message?.transactionHash === undefined) return false;
            if (message?.values === undefined) return false;

            let txnReceipt = await this.provider.waitForTransaction(message.transactionHash, message.values.confirmations);

            if (txnReceipt.confirmations < message.values.confirmations) {
                // something went wrong if we get here, abort
                console.log('abort wait for confirmations');
                delete (this.signatures[message.values.txId]);
                return false;
            }

            const chainConfig = getChainConfig(this.chainId);
            if (!chainConfig || !chainConfig.message) {
                throw new Error(`No chain config or message contract found for chainId ${this.chainId}`);
            }

            for (let x = 0; x < txnReceipt.logs.length; x++) {
                try {
                    if (txnReceipt.logs[x].address.toLowerCase() !== this.contract.address.toLowerCase()) continue;
                    const chainData = this.chainInterface.parseLog(txnReceipt.logs[x]);

                    if (
                        txnReceipt.logs[x].address.toLowerCase() === chainConfig.message.toLowerCase() &&
                        txnReceipt.transactionHash.toLowerCase() === message.transactionHash.toLowerCase() &&
                        chainData.args.sender.toLowerCase() === message.values.sender.toLowerCase() &&
                        chainData.args.recipient.toLowerCase() === message.values.recipient.toLowerCase() &&
                        chainData.args.express === message.values.express &&
                        chainData.args.data === message.values.encodedData &&
                        chainData.args.confirmations === message.values.confirmations &&
                        chainData.args.txId.toString() === message.values.txId.toString() &&
                        chainData.args.chain.toString() === message.values.chain.toString()
                    ) {
                        return true; // we have a match, message is valid
                    }
                } catch (err: any) {
                    if (err.reason !== 'no matching event') console.log(err);
                }
            }

            return false;
        } catch (err) {
            console.log('error validating message');
            console.log(err);
            return false;
        }
    }

    /**
     * Checks if a message has been processed based on its transaction ID.
     * 
     * @param message - The message to check.
     * @returns Promise that resolves to true if the message is processed, otherwise false.
     */
    async isMessageProcessed(message: IMessage): Promise<boolean> {
        try {
            return await this.contract.processedTransfers(message.values!.txId);
        } catch (err) {
            console.log('error checking if message is processed');
            console.log(err);
            return false;
        }
    }

    /**
    * Populates additional message details from blockchain event logs after a transaction.
    * This method extracts and assigns feature-related data and basic transaction details
    * from the respective logs if they exist. We do not trust the data from the p2p network.
    * 
    * @param message - The initial message object that contains only basic transaction details.
    * @returns Promise that resolves to the message object populated with detailed information from logs.
    */
    public async populateMessage(message: IMessage): Promise<IMessage> {
        const txnReceipt = await this.provider.getTransactionReceipt(message.transactionHash!);
        const featureTopic = ethers.utils.id('SendMessageWithFeature(uint256,uint256,uint32,bytes)');
        const messageTopic = ethers.utils.id('SendRequested(uint256,address,address,uint256,bool,bytes,uint16)');
        const featureLog = txnReceipt.logs.find((l: any) => l.topics[0] === featureTopic);
        const messageLog = txnReceipt.logs.find((l: any) => l.topics[0] === messageTopic);

        if (featureLog) {
            logDebug(this.chainId, 'feature log found');
            const featureRequest = this.featureInterface.decodeEventLog(featureTopic, featureLog.data);

            message.featureId = Number(featureRequest[2]);
            message.featureData = featureRequest[3].toString();
        } else {
            logDebug(this.chainId, 'no feature log found');
        }

        if (messageLog) {
            logDebug(this.chainId, 'message log found');
            const messageRequest = this.chainInterface.decodeEventLog(messageTopic, messageLog.data);

            message.values = {
                txId: ethers.BigNumber.from(messageRequest[0]).toString(),
                sender: messageRequest[1],
                recipient: messageRequest[2],
                chain: ethers.BigNumber.from(messageRequest[3]).toString(),
                express: messageRequest[4],
                encodedData: messageRequest[5],
                confirmations: ethers.BigNumber.from(messageRequest[6]).toNumber()
            };
        } else {
            logDebug(this.chainId, 'no message log found');
        }

        return message;
    }

    /**
     * Fetches the chainsig, the signature for the chain, indicating authority or special recognition.
     * @returns Promise that resolves to the chainsig address.
     */
    public async getChainsig(): Promise<string> {
        return await this.contract.chainsig();
    }

    /**
     * Retrieves an external signature for a project.
     * @param project - The project for which to get the signature.
     * @returns Promise that resolves to the external signature.
     */
    public async getExsig(project: string): Promise<string> {
        return await this.contract.exsig(project);
    }
}
