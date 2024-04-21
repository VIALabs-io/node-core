// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { IDriverBase } from "./IDriverBase.js";
import { IMessage } from "./IMessage.js";

/**
 * Interface for the Feature class.
 */
export interface IFeature {
    /**
     * Unique identifier for the feature.
     */
    featureId: number;

    /**
     * Name of the feature.
     */
    featureName: string;

    /**
     * Description of what the feature does.
     */
    featureDescription: string;

    /**
     * Processes the given message according to the feature's logic.
     * 
     * @param driver The driver handling the blockchain interactions.
     * @param message The message containing data to be processed.
     * @returns A Promise resolving to an IMessage with the processing result.
     */
    process(driver: IDriverBase, message: IMessage): Promise<IMessage>;

    /**
     * Validates a message to ensure it meets the requirements for the feature to
     * be a valid message for signature.
     * 
     * @param driver The driver handling the blockchain interactions.
     * @param message The message to validate.
     * @returns A Promise resolving to a boolean indicating if the message is valid.
     */
    isMessageValid(driver: IDriverBase, message: IMessage): Promise<boolean>;
}
