// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

/**
 * Defines the structure for network configuration details.
 */
export interface NetworkConfig {
    id: string;             // Unique identifier for the network
    type: string;           // Type of the network, e.g., "evm"
    name: string;           // Human-readable name of the network
    rpc: string;            // Primary RPC URL for network interaction
    rpcExec?: string;       // Optional secondary RPC URL for executing commands
    finality: number;       // The number of confirmations required to consider a transaction final
}

/**
 * Represents a mapping of network strings to their respective configurations.
 */
export interface IChainConfig {
    [network: string]: NetworkConfig; // Index signature for accessing network configurations by their string identifiers
}
