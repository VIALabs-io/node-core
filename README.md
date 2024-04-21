# @vialabs-io/node-core

The `node-core` package is a fundamental component of the VIA network, providing a robust set of tools and drivers for operating a decentralized messaging and transaction system across multiple blockchain networks. It includes implementations for handling and validating cross-chain messages, deploying and managing blockchain-specific drivers, and integrating feature modules dynamically.

## Features

- **Cross-chain Communication**: Facilitates reliable and secure message passing between different blockchain networks.
- **Dynamic Feature Integration**: Supports the addition of features that can extend the functionality dynamically at runtime.
- **Decentralized Operation**: Designed to operate in a decentralized manner, enhancing security and reliability.
- **Driver System**: Modular architecture allows for the addition of drivers for various blockchain platforms.

## Installation

To install the `node-core` package, run the following command in your project directory:

```bash
npm install @vialabs-io/node-core
```

Ensure that your environment is set up with Node.js and npm (Node Package Manager).

## Usage

Here is how you can use the `node-core` package to initiate a Vladiator instance and start processing messages:

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

## Configuration

The `node-core` package requires a configuration file (`config.json`) that includes the necessary details for each blockchain network it will interact with. This file should specify the network IDs, RPC URLs, and other relevant settings.

Example `config.json`:

```json
{
    "ethereum": {
        "networkId": "1",
        "rpcUrl": "https://mainnet.infura.io/v3/YOUR_INFURA_KEY"
    },
    "binanceSmartChain": {
        "networkId": "56",
        "rpcUrl": "https://bsc-dataseed.binance.org/"
    }
}
```

## Adding Features

Features can extend the functionality of the system dynamically. Each feature must implement the `IFeature` interface.

### Creating a Feature
Develop your feature in the `features/` directory. Ensure it implements necessary methods for processing and validation.

### Registering Features
Add your new feature to the `features/index.ts`. This registration makes it available for dynamic loading during runtime.

### Example Usage
To dynamically load and integrate features, you can follow this approach:

```javascript
import { Vladiator } from '@vialabs-io/node-core/Vladiator';
import config from './path/to/your/config.json';

const privateKey = process.env.NODE_PRIVATE_KEY;
const vladiator = new Vladiator(privateKey, config);

const features = await import('./features/index.js').then(module => module.default);

if (features) {
    const keys = Object.keys(features);
    for (let i = 0; i < keys.length; i++) {
        vladiator.loadFeature(new features[Number(keys[i])]);
    }
    console.log(`Loaded ${keys.length} features.`);
}
```

## Contributing

Contributions to the `node-core` package are welcome. Please ensure to pass all tests and follow the coding conventions and commit guidelines described in the contributing guide.

## License

See the [LICENSE.md](LICENSE.md) file for details.

## Support

For support, email developers@vialabs.io or open an issue in the GitHub repo.
