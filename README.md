# @vialabs-io/node-core

The `node-core` package is a fundamental component of the VIA network, providing a robust set of tools and drivers for operating a decentralized messaging and transaction system across multiple blockchain networks. It includes implementations for handling and validating cross-chain messages, deploying and managing blockchain-specific drivers, integrating feature modules dynamically, and enabling real-time data streaming.

## Features

- **Cross-chain Communication**: Facilitates reliable and secure message passing between different blockchain networks.
- **Dynamic Feature Integration**: Supports the addition of features that can extend the functionality dynamically at runtime.
- **Decentralized Operation**: Designed to operate in a decentralized manner, enhancing security and reliability.
- **Driver System**: Modular architecture allows for the addition of drivers for various blockchain platforms.
- **Real-time Data Streaming**: Stream data to clients with the ability to apply filters to manage the data flow efficiently.
- **Discord Integration**: Seamlessly send messages to a Discord channel for monitoring or alerting purposes.

## Installation

To install the `node-core` package, run the following command in your project directory:

```bash
npm install @vialabs-io/node-core
```

Ensure that your environment is set up with Node.js and npm (Node Package Manager).

## Environment Setup

The `node-core` package relies on several environment variables to configure its behavior. These variables are used to connect to services like Discord, configure the data stream server, and set up the node's operational environment.

### Example `.env` File

Your project’s `.env` file should look something like this:

```plaintext
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
DISCORD_CHANNEL_ID=your_discord_channel_id_here
DISCORD_COMMAND_CHANNEL_ID=your_discord_command_channel_id_here

# Data Stream Server Configuration
DATA_STREAM_PORT=2323

# Node Configuration
NODE_ENV=development
DEBUG=true
NODE_PRIVATE_KEY=your_private_key_here
NODE_PUBLIC_KEY=your_public_key_here
```

### Environment Variables

#### Discord Configuration

- **DISCORD_TOKEN**: The token for your Discord bot. This is required to connect the bot to your Discord server.
- **DISCORD_CLIENT_ID**: The client ID of your Discord bot.
- **DISCORD_CHANNEL_ID**: The ID of the Discord channel where the bot will send messages.
- **DISCORD_COMMAND_CHANNEL_ID**: The ID of the Discord channel where the bot will listen for commands.

These variables are essential if you plan to integrate Discord functionality into your `Vladiator` instance. If any of these are missing, the Discord bot will not be initialized.

#### Data Stream Server Configuration

- **DATA_STREAM_PORT**: The port on which the `DataStreamServer` will run. If this is not set, the data stream server will not start. Setting this allows the server to stream data over WebSocket to connected clients.

#### Node Configuration

- **NODE_ENV**: Specifies the environment in which the node is running (`development` or `production`). This can affect logging and other environment-specific behaviors.
- **DEBUG**: When set to `true`, enables verbose logging for debugging purposes. This is useful during development to get more detailed logs.
- **NODE_PRIVATE_KEY**: The private key for your node. This is crucial for signing messages and should be kept secure.
- **NODE_PUBLIC_KEY**: The public key associated with your node. This is used to identify your node on the network.

## Usage

### Initializing Vladiator

The `Vladiator` class is the core of the `node-core` package. It handles P2P network operations, message processing, and driver management.

Here is how you can use the `node-core` package to initiate a `Vladiator` instance and start processing messages:

```javascript
import { Vladiator } from '@vialabs-io/node-core/Vladiator';
import config from './path/to/your/config.json';

const privateKey = process.env.NODE_PRIVATE_KEY;
const vladiator = new Vladiator(privateKey, config);

vladiator.start().then(() => {
    console.log("Vladiator is running!");
}).catch(error => {
    console.error("Failed to start Vladiator:", error);
});
```

### Filtering Data in DataStreamServer

The `DataStreamServer` component allows you to stream data in real-time over a WebSocket connection. To manage the flow of data more effectively, you can apply filters to ensure that only the messages matching specific criteria are streamed.

#### Setting Filters

You can set filters during the initialization of the `Vladiator` instance. Filters are passed as an argument and are applied to both the data stream and any messages sent to Discord.

Here’s an example of how to set filters:

```javascript
import dotenv from 'dotenv';
import { Vladiator } from '@vialabs-io/node-core/Vladiator';
import config from './path/to/your/config.json';

dotenv.config();

const privateKey = process.env.NODE_PRIVATE_KEY;

const filters = {
    author: 'Alice',              // Only include messages authored by 'Alice'
    source: 1,                    // Only include messages from source chain 1
    values: {
        sender: '0xSenderAddress' // Only include messages where the sender is '0xSenderAddress'
    }
};

// Pass filters during Vladiator initialization
const vladiator = new Vladiator(privateKey, config, filters);

vladiator.start().then(() => {
    console.log("Vladiator is running with filters applied!");
}).catch(error => {
    console.error("Failed to start Vladiator:", error);
});
```

#### How Filters Work

1. **DataStreamServer**: The filters are applied to all messages before they are sent over the WebSocket connection. Only messages that meet the filter criteria will be streamed to connected clients.

2. **Discord Integration**: The same filters are applied to messages sent to Discord. If a message does not meet the filter criteria, it will not be forwarded to the Discord channel.

#### Example Filters

- **Author**: Filter messages based on the `author` field.
- **Source Chain**: Filter messages based on the `source` field, indicating the source blockchain.
- **Sender**: Filter messages based on the `sender` within the `values` object.

#### Updating Filters

If you need to update the filters after the `Vladiator` has been initialized, you can implement a method to update them in your project. This flexibility allows dynamic changes to the filtering criteria based on runtime conditions.

```javascript
// Assuming `vladiator` is already initialized
const newFilters = {
    author: 'Bob',
    values: {
        recipient: '0xRecipientAddress'
    }
};

vladiator.setDiscordFilters(newFilters);
```

### Adding and Implementing Features

The `node-core` package allows you to extend its functionality by adding features that process and validate messages. These features can interact with both on-chain and off-chain systems, linking smart contracts to external APIs, private databases, or control logic.

#### Creating a Feature

To create a feature, extend the `FeatureBase` class, which requires implementing two methods:

- **process(driver: DriverBase, message: IMessage)**: Defines the logic to process messages.
- **isMessageValid(driver: DriverBase, message: IMessage)**: Validates messages before processing.

Here’s an example feature implementation:

##### src/features/MyFeature.js

```javascript
import FeatureBase from './FeatureBase.js';
import DriverBase from '../drivers/DriverBase.js';
import { IMessage } from '../types/IMessage.js';
import { ethers } from 'ethers';

export default class MyFeature extends FeatureBase {
    public async process(driver: DriverBase, message: IMessage): Promise<IMessage> {
        // Example processing logic
        const decodedData = ethers.utils.defaultAbiCoder.decode(["string"], message.featureData!);
        console.log("Processing feature data:", decodedData);

        // Modify message and return
        message.featureReply = ethers.utils.hexlify(ethers.utils.toUtf8Bytes("Processed Data"));
        return message;
    }

    public async isMessageValid(driver: DriverBase, message: IMessage): Promise<boolean> {
        // Example validation logic
        return message.featureData !== undefined;
    }
}
```

#### Automatically Loading Features

To automatically load features, create your feature modules in the `src/features` directory. Ensure they are exported from the `src/features/index.ts` file. For example:

##### src/features/index.ts

```typescript
import MyFeature from "./MyFeature.js";

export default [new MyFeature()];
```

With this setup, all features exported from `src/features/index.ts` will be automatically loaded and initialized by the `Vladiator` during startup.

#### Example Usage

There is no need for additional code to load features manually; simply place them in the `src/features` directory and ensure they are correctly exported.

### DataStreamClient

The `DataStreamClient` package allows you to connect to a real-time data stream from the P2P validation network. This is particularly useful for clients or services that need to react to or process real-time events as they occur in the network.

#### Example Usage

```javascript
import { DataStreamClient } from '@vialabs-io/node-core/DataStreamClient';

// Create a new instance of DataStreamClient (run local node or point to external node)
const client = new DataStreamClient('https://localhost:3000');

// Connect to the

 server
client.connect(
    (message) => {
        // Handle incoming message
        console.log('Received message:', message);
    },
    () => {
        // On connect callback
        console.log('Connected to server');
    },
    () => {
        // On disconnect callback
        console.log('Disconnected from server');
    }
);
```

### Contributing

Contributions to the `node-core` package are welcome. Please ensure to pass all tests and follow the coding conventions and commit guidelines described in the contributing guide.

### License

See the [LICENSE.md](LICENSE.md) file for details.

### Support

For support, email developers@vialabs.io or open an issue in the GitHub repo.