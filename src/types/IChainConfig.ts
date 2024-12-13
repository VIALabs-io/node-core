// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

/**
 * Defines the structure for network configuration details.
 */
export interface NetworkConfig {
    id: string;             // Unique identifier for the network
    type: string;           // Type of the network, e.g., "EVMMV3", "Reef"
    name: string;           // Human-readable name of the network
    rpc: string;            // Primary RPC URL for network interaction
    rpcExec?: string;       // Optional secondary RPC URL for executing commands
    finality: number;       // The number of confirmations required to consider a transaction final
    chunkSize?: number;     // Optional size of chunks for batch processing
    lookback?: number;      // Optional number of blocks to look back
    lookbackDelay?: number; // Optional delay between lookbacks
    freeGas?: boolean;      // Optional flag for free gas
    gasOffset?: number;     // Optional gas price offset
    forceLegacyGas?: boolean; // Optional flag to force legacy gas
    forceGasFeeAmount?: string; // Optional fixed gas fee amount
}

/**
 * Represents a mapping of network strings to their respective configurations.
 * This interface maintains compatibility with node-full's configuration structure
 * while focusing on the essential fields needed for node-core functionality.
 */
export interface IChainConfig {
    [network: string]: NetworkConfig;
}
