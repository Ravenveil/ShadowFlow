require('@nomicfoundation/hardhat-ethers');
require('dotenv').config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun', // ALWAYS cancun for 0G Chain
    },
  },
  networks: {
    '0g-testnet': {
      url: 'https://evmrpc-testnet.0g.ai',
      chainId: 16602, // 0G Galileo testnet
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
