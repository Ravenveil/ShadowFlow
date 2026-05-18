// Deploy TemplateRegistry to 0G Galileo testnet
// Usage: npx hardhat run scripts/deploy_template_registry.js --network 0g-testnet
//
// Prerequisites:
//   PRIVATE_KEY= in .env  (get A0GI from https://faucet.0g.ai)

import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying TemplateRegistry with:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Balance:', ethers.formatEther(balance), 'A0GI');

  const TemplateRegistry = await ethers.getContractFactory('TemplateRegistry');
  const registry = await TemplateRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log('\nTemplateRegistry deployed to:', address);
  console.log('\nAdd to .env:');
  console.log(`  VITE_TEMPLATE_REGISTRY_ADDRESS=${address}`);
  console.log('\nVerify on explorer:');
  console.log(`  https://chainscan-galileo.0g.ai/address/${address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
