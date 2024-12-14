// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

/**
 * Defines the structure for messages handled within the system.
 */
interface IMessage {
    type: string;                       // The type of message (e.g., request, response)
    author: string;                     // The author or initiator of the message

    source?: number;                    // Source chain ID
    transactionHash?: string;           // Transaction hash
    executionHash?: string;             // Execution hash

    sourceGas?: string;                 // Gas cost on source chain
    sourceTimestamp?: number;           // Timestamp of source transaction
    destGas?: string;                   // Gas cost on destination chain
    destTimestamp?: number;             // Timestamp of destination transaction
    destGasRefund?: string;             // Gas refund on destination chain
    tokenPrice?: string;                // Token price at execution
    validatorBalance?: string;          // Validator's balance

    /**
     * Values associated with the message, providing details about the transaction.
     */
    values?: {
        txId: string;                   // Transaction identifier (uint256 0)
        sender: string;                 // Sender's address (string 1)
        recipient: string;              // Recipient's address (string 2)
        chain: string;                  // Destination chain ID (uint256 3)
        express: boolean;               // Whether the transaction is express (bool 4)
        encodedData: string;            // Encoded data sent with the transaction (string 5)
        confirmations: number;          // Number of confirmations required (uint16 6)
    };

    featureId?: number;                // Optional feature ID for extended functionality
    featureData?: string;              // Additional data for the feature
    featureReply?: string;             // Reply data from the feature execution
    featureFailed?: boolean;           // Indicates if the feature execution failed

    signer?: string;                   // The signer of the message
    signature?: string;                // Signature of the message
    chainsig?: string;                 // Chain-wide signature for cross-chain acknowledgment
    exsig?: string;                    // External signature for validation
}

export { IMessage };
