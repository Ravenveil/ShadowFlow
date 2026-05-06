import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-ethers';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun', // ALWAYS cancun for 0G Chain — NEVER paris or older
    },
  },
  networks: {
    '0g-testnet': {
      type: 'http',
      url: 'https://evmrpc-testnet.0g.ai',
      chainId: 16602, // 0G Galileo testnet (NOT 16600 — that was Newton, deprecated)
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
