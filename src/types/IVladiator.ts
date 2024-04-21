// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import DriverBase from "../drivers/DriverBase.js";
import { IMessage } from "./IMessage.js";

/**
 * Interface for the Vladiator class, which orchestrates the interaction between different blockchain drivers and features.
 */
interface IVladiator {
    /**
     * Sends a message across the network.
     * @param message - The message object to send.
     * @returns A promise that resolves when the message is sent.
     */
    sendMessage(message: IMessage): Promise<void>;

    /**
     * A record of chain drivers indexed by chain identifiers.
     */
    drivers: Record<string, DriverBase>;

    /**
     * The private key of the node, used for signing transactions and messages.
     */
    nodePrivateKey: string;

    /**
     * A record of features available in the system, indexed by feature identifiers.
     */
    features: Record<string, any>;

    /**
     * Sends a message to the Discord system.
     * @param message - The message to be sent, which can be a string or an IMessage structure.
     * @returns A promise that resolves when the message is sent.
     */
    sendDiscord(message: IMessage | string): Promise<void>;
}

export { IVladiator };
