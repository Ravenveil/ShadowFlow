// Deploy TemplateRegistry to 0G Galileo testnet
const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying TemplateRegistry with:', deployer.address);
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Balance:', hre.ethers.formatEther(balance), 'OG');

  const TemplateRegistry = await hre.ethers.getContractFactory('TemplateRegistry');
  const registry = await TemplateRegistry.deploy();
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  console.log('\nTemplateRegistry deployed to:', address);
  console.log('\nAdd to .env:');
  console.log(`  VITE_TEMPLATE_REGISTRY_ADDRESS=${address}`);
  console.log('\nVerify:');
  console.log(`  https://chainscan-galileo.0g.ai/address/${address}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
