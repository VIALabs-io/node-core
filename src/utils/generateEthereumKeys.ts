// Copyright 2021-2024 Atlas
// Author: Atlas (atlas@vialabs.io)

import { ethers } from 'ethers';

/**
 * Generates a new Ethereum wallet with a random private key and associated public address,
 * then outputs them to the console.
 */
function generateEthereumKeys(): void {
    const wallet = ethers.Wallet.createRandom();
    console.log(`NODE_PRIVATE_KEY=${wallet.privateKey}`);
    console.log(`NODE_PUBLIC_KEY=${wallet.address}`);
}

generateEthereumKeys();
