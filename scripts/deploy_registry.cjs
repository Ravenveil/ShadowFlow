// Deploy RunRegistry to 0G Galileo testnet
// Usage: npx hardhat run scripts/deploy_registry.cjs --network 0g-testnet
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying RunRegistry with account:', deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', hre.ethers.formatEther(balance), 'OG');

  const RunRegistry = await hre.ethers.getContractFactory('RunRegistry');
  const registry = await RunRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log('\nRunRegistry deployed to:', address);
  console.log('\nAdd to .env:');
  console.log(`  VITE_RUN_REGISTRY_ADDRESS=${address}`);
  console.log('\nVerify:');
  console.log(`  https://chainscan-galileo.0g.ai/address/${address}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
