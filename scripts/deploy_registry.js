// Deploy RunRegistry to 0G Galileo testnet
// Usage: npx hardhat run scripts/deploy_registry.js --network 0g-testnet
//
// Prerequisites:
//   1. npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
//   2. Set PRIVATE_KEY= in .env (must have A0GI testnet tokens from https://faucet.0g.ai)
//   3. Set VITE_RUN_REGISTRY_ADDRESS= in .env with the printed address after deploy

import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying RunRegistry with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'A0GI');

  const RunRegistry = await ethers.getContractFactory('RunRegistry');
  const registry = await RunRegistry.deploy();
  await registry.waitForDeployment(); // ethers v6: waitForDeployment(), not deployed()

  const address = await registry.getAddress(); // ethers v6: getAddress(), not .address
  console.log('RunRegistry deployed to:', address);
  console.log('');
  console.log('Add to .env:');
  console.log(`  VITE_RUN_REGISTRY_ADDRESS=${address}`);
  console.log('');
  console.log('Verify on explorer:');
  console.log(`  https://chainscan-galileo.0g.ai/address/${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
