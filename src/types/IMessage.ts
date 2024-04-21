// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

/**
 * Defines the structure for messages handled within the system.
 */
interface IMessage {
    type: string;                       // The type of message (e.g., request, response)
    author: string;                     // The author or initiator of the message

    source?: number;                    // Source chain ID, optional
    transactionHash?: string;           // Transaction hash, optional
    executionHash?: string;             // Execution hash, optional

    /**
     * Values associated with the message, providing details about the transaction.
     */
    values?: {
        txId: string;                   // Transaction identifier
        sender: string;                 // Sender's address
        recipient: string;              // Recipient's address
        chain: string;                  // Destination chain ID
        express: boolean;               // Whether the transaction is express
        encodedData: string;            // Encoded data sent with the transaction
        confirmations: number;          // Number of confirmations required
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
