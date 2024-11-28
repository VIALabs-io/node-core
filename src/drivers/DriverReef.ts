// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { ethers } from "ethers";
import { IMessage } from "../types/IMessage.js";
import { getChainConfig } from "@vialabs-io/npm-registry";
import DriverBase from "./DriverBase.js";
import { logDebug } from "../utils/logDebug.js";
import { stringToU8a, u8aToHex, hexToU8a, u8aConcat } from "@polkadot/util";
import { decodeAddress, encodeAddress, blake2AsU8a } from "@polkadot/util-crypto";
import { TestAccountSigningKey, Provider, Signer } from "@reef-chain/evm-provider";
import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import { SignedBlock } from "@polkadot/types/interfaces/runtime";
import { SignerPayloadRaw } from "@polkadot/types/types";

type ReefSigner = Signer & { address: string };
type ReefSigningKey = TestAccountSigningKey & { signRaw: (inp: SignerPayloadRaw) => Promise<{ id: number; signature: `0x${string}` | string }> };
type ReefLogDescription = ethers.utils.LogDescription & {
    extrinsicId?: number;
    blockHash?: string;
    transactionHash?: string;
    blockNumber?: string;
    blockTimestamp?: number;
    address?: string;
    gasUsed?: string;
};
type ReefFee = { partial: BigInt; base: BigInt; adjusted: BigInt; estimatedWeight: BigInt };

/**
 * A blockchain driver for EVM-based chains with additional methods to handle message validation and processing.
 */
export default class DriverReef extends DriverBase {
    public provider!: Provider; // WS RPC provider for network interaction
    private contract!: ethers.Contract; // Smart contract interaction handler
    private chainInterface = new ethers.utils.Interface([
        // Interface for interpreting blockchain events and function calls
        "event SendRequested(uint txId, address sender, address recipient, uint chain, bool express, bytes data, uint16 confirmations)",
        "event SendProcessed(uint txId, uint sourceChainId, address sender, address recipient)",
        "event Success(uint txId, uint sourceChainId, address sender, address recipient, uint amount)",
        "event SetChainsig(address signer)",
        "function processedTransfers(uint txId) view returns (bool)",
        "function chainsig() view returns (address)",
        "function exsig(address project) view returns (address)",
    ]);
    private featureInterface = new ethers.utils.Interface([
        // Interface for handling features related to blockchain transactions
        "function process(uint txId, uint sourceChainId, uint destChainId, address sender, address recipient, uint gas, uint32 featureId, bytes calldata featureReply, bytes[] calldata data) external",
        "event SendMessageWithFeature(uint txId, uint destinationChainId, uint32 featureId, bytes featureData)",
    ]);

    async getSigner(): Promise<ReefSigner | null> {
        const mnemonic = process.env.REEF_MNEMONIC;

        if (mnemonic) {
            const keyring = new Keyring({ type: "sr25519" });
            const pair = keyring.addFromUri(mnemonic);

            // @note TestAccountSigningKey
            const signingKey = new TestAccountSigningKey(this.provider.api.registry) as ReefSigningKey;
            signingKey.addKeyringPair(pair);

            signingKey.signRaw = async function (payload: SignerPayloadRaw) {
                const privateKey = process.env.NODE_PRIVATE_KEY!;
                const wallet = new ethers.Wallet(privateKey);

                const message = payload.data;

                const flatSig = await wallet.signMessage(message);

                return { id: 0, signature: flatSig };
            };

            const signer = new Signer(this.provider, pair.address, signingKey) as ReefSigner;

            const evmAddr = await signer.getAddress();

            // Claim default account
            if (!(await signer.isClaimed())) {
                console.log("No claimed EVM account found -> claimed default EVM account: ", await signer.getAddress());
                await signer.claimDefaultAccount();
            }

            signer.address = evmAddr;
            return signer;
        }

        return null;
    }

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

            this.provider = new Provider({
                provider: new WsProvider(rpcAddress),
            });

            // @note Connect first then we can interact
            await this.provider.api.isReady;

            const signer = await this.getSigner();
            if (!signer) return console.log("No signer available");

            // this.nodeSigner = signer;
            // this.nodePublicKey = this.nodeSigner.address;

            this.contract = new ethers.Contract(chainConfig.message, this.chainInterface, signer);
        } catch (err) {
            console.log("error connecting to RPC for " + this.chainId + " (" + rpcAddress + ")");
            console.log(err);
        }
    }

    async __getFees(blockHash: string, txId: number): Promise<ReefFee | null> {
        const { block } = await this.provider.api.rpc.chain.getBlock(blockHash);

        const queryInfo = await this.provider.api.rpc.payment.queryInfo(block.extrinsics[txId].toHex(), block.header.parentHash);
        const queryFeeDetails = await this.provider.api.rpc.payment.queryFeeDetails(block.extrinsics[txId].toHex(), block.header.parentHash);

        const baseFee = queryFeeDetails.inclusionFee.isSome ? queryFeeDetails.inclusionFee.unwrap().baseFee.toBigInt() : BigInt(0);
        const lenFee = queryFeeDetails.inclusionFee.isSome ? queryFeeDetails.inclusionFee.unwrap().lenFee.toBigInt() : BigInt(0);
        const adjustedWeightFee = queryFeeDetails.inclusionFee.isSome
            ? queryFeeDetails.inclusionFee.unwrap().adjustedWeightFee.toBigInt()
            : BigInt(0);
        const estimatedWeight = queryInfo.weight.toBigInt();
        const estimatedPartialFee = queryInfo.partialFee.toBigInt();

        const apiAt = await this.provider.api.at(blockHash);
        const allRecords = await apiAt.query.system.events();
        const successEvent = allRecords.find(
            (event) =>
                event.phase.isApplyExtrinsic &&
                event.phase.asApplyExtrinsic.eq(txId) &&
                this.provider.api.events.system.ExtrinsicSuccess.is((event as any).event)
        );

        if (!successEvent) {
            console.log("ExtrinsicSuccess event not found");
            return null;
        }

        const [dispatchInfo] = successEvent.event.data;
        const dispatchInfoJSON = dispatchInfo.toJSON() as any;
        if (dispatchInfoJSON.paysFee === "No") {
            console.log("actual partial fee:", 0);
            return null;
        }
        const actualWeight = BigInt(dispatchInfoJSON.weight);

        console.log("ALL FEES", baseFee, lenFee, adjustedWeightFee, estimatedWeight, actualWeight);

        const partialFee = baseFee + lenFee + (adjustedWeightFee / estimatedWeight) * actualWeight;

        return { partial: partialFee, base: baseFee, adjusted: adjustedWeightFee, estimatedWeight: estimatedWeight };
    }

    private async __processBlock(blockHash: string): Promise<ReefLogDescription[]> {
        const messages: ReefLogDescription[] = [];
        const blockData = await this.provider.api.rpc.chain.getBlock(blockHash);
        const allEvents = await this.provider.api.query.system.events.at(blockHash);

        const blockTimestamp = await this.provider.api.query.timestamp.now.at(blockHash);

        // Get the specific extrinsic
        const extrinsics = blockData.block.extrinsics;

        extrinsics.forEach((extrinsic, idx) => {
            let parsedLog: ReefLogDescription | null = null;

            allEvents
                .filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(idx))
                .forEach((el, elIdx) => {
                    const { phase, event } = el;
                    const appliesToExtrinsicID = idx;

                    const { method, section, data } = event;

                    // @note Only EVM type logs
                    if (method == "Log") {
                        data.forEach((item) => {
                            const evmEvent = item.toJSON();

                            if (this.contract.address.toLowerCase() != evmEvent.address.toLowerCase()) return;

                            const parsedLogData: ReefLogDescription = this.chainInterface.parseLog(evmEvent);

                            parsedLogData.blockHash = blockHash;
                            parsedLogData.transactionHash = `${blockData.block.header.number.toString()}-${appliesToExtrinsicID}`;
                            parsedLogData.extrinsicId = appliesToExtrinsicID;
                            parsedLogData.blockNumber = blockData.block.header.number.toString();
                            parsedLogData.blockTimestamp = parseInt(blockTimestamp.toString());

                            parsedLogData.address = evmEvent.address;

                            parsedLog = { ...parsedLogData };
                        });
                    }

                    // @note this event is always after "Log" event
                    if (method == "ExtrinsicSuccess") {
                        if (parsedLog) parsedLog.gasUsed = data[0].weight.toString().replace(/,/g, "");
                    }
                });

            if (parsedLog) {
                messages.push(parsedLog);
            }
        });

        return messages;
    }

    private async __getTransaction(blockHash: string, blockNum: string, txIndex: number) {
        const messages = await this.__processBlock(blockHash.toString());

        for (const msg of messages) {
            const txHash = `${blockNum}-${txIndex}`;

            if (msg.transactionHash != txHash) continue;

            const feeData = await this.provider.getFeeData();
            const altFeeData = await this.__getFees(blockHash.toString(), txIndex);

            const txnReceipt = {
                logs: messages,
                transactionHash: txHash,
                blockNumber: blockNum,
                gasUsed: msg.gasUsed,
                effectiveGasPrice: feeData.gasPrice,
                gasPrice: feeData.gasPrice,
            };

            return txnReceipt;
        }

        return null;
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

            const splitTxHash = message.transactionHash.split("-");
            const blkHash = await this.provider.api.rpc.chain.getBlockHash(splitTxHash[0]);
            let txnReceipt = await this.__getTransaction(blkHash.toString(), splitTxHash[0], parseInt(splitTxHash[1]));

            if (!txnReceipt) {
                console.log("Couldn't find the desired index in the block");
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
                    if (err.reason !== "no matching event") console.log(err);
                }
            }

            return false;
        } catch (err) {
            console.log("error validating message");
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
            console.log("error checking if message is processed");
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
        const splitTxHash = message.transactionHash!.split("-");
        const blkHash = await this.provider.api.rpc.chain.getBlockHash(splitTxHash[0]);
        const txnReceipt = await this.__getTransaction(blkHash.toString(), splitTxHash[0], parseInt(splitTxHash[1]));
        const featureTopic = ethers.utils.id("SendMessageWithFeature(uint256,uint256,uint32,bytes)");
        const messageTopic = ethers.utils.id("SendRequested(uint256,address,address,uint256,bool,bytes,uint16)");
        const featureLog = txnReceipt.logs.find((l: any) => l.topics[0] === featureTopic);
        const messageLog = txnReceipt.logs.find((l: any) => l.topics[0] === messageTopic);

        if (featureLog) {
            logDebug(this.chainId, "feature log found");
            const featureRequest = this.featureInterface.decodeEventLog(featureTopic, featureLog.data);

            message.featureId = Number(featureRequest[2]);
            message.featureData = featureRequest[3].toString();
        } else {
            logDebug(this.chainId, "no feature log found");
        }

        if (messageLog) {
            logDebug(this.chainId, "message log found");
            const messageRequest = this.chainInterface.decodeEventLog(messageTopic, messageLog.data);

            message.values = {
                txId: ethers.BigNumber.from(messageRequest[0]).toString(),
                sender: messageRequest[1],
                recipient: messageRequest[2],
                chain: ethers.BigNumber.from(messageRequest[3]).toString(),
                express: messageRequest[4],
                encodedData: messageRequest[5],
                confirmations: ethers.BigNumber.from(messageRequest[6]).toNumber(),
            };
        } else {
            logDebug(this.chainId, "no message log found");
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
