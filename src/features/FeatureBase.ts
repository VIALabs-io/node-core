// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { IDriverBase } from "../types/IDriverBase.js";
import { IMessage } from "../types/IMessage.js";
import { IFeature } from "../types/IFeature.js";

/**
 * Base class for all features in the system.
 * Features provide additional functionality that can be processed during message handling.
 */
export default abstract class FeatureBase implements IFeature {
    /**
     * Unique identifier for the feature.
     */
    abstract featureId: number;

    /**
     * Name of the feature.
     */
    abstract featureName: string;

    /**
     * Description of what the feature does.
     */
    abstract featureDescription: string;

    /**
     * Process the feature's functionality.
     * @param driver The blockchain driver handling the message
     * @param message The message containing feature data
     * @returns The processed message
     */
    abstract process(driver: IDriverBase, message: IMessage): Promise<IMessage>;

    /**
     * Validate if the message is valid for this feature.
     * @param driver The blockchain driver handling the message
     * @param message The message to validate
     * @returns Whether the message is valid for this feature
     */
    abstract isMessageValid(driver: IDriverBase, message: IMessage): Promise<boolean>;
}
