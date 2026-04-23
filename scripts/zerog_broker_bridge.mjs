/**
 * 0G Compute Broker Bridge — Node.js subprocess called by Python backend.
 *
 * Commands (passed as argv[2]):
 *   metadata   — get endpoint + model for a provider
 *   headers    — generate signed auth headers
 *   process    — call processResponse for fee settlement
 *   acknowledge — one-time provider acknowledgement
 *   balance    — check provider sub-account balance
 *   list       — list available compute services
 *
 * All output is JSON on stdout. Errors exit with code 1.
 */

import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

const RPC_URL = process.env.ZEROG_RPC_URL || process.env.RPC_URL || 'https://evmrpc-testnet.0g.ai';
const PRIVATE_KEY = process.env.ZEROG_PRIVATE_KEY || process.env.PRIVATE_KEY;
const PROVIDER_ADDR = process.env.ZEROG_PROVIDER_ADDRESS || process.env.PROVIDER_ADDRESS;

function fatal(msg) {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

if (!PRIVATE_KEY) fatal('ZEROG_PRIVATE_KEY (or PRIVATE_KEY) not set in .env');

async function getBroker() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  return createZGComputeNetworkBroker(wallet);
}

const command = process.argv[2];
const args = process.argv.slice(3);

try {
  const broker = await getBroker();
  let result;

  switch (command) {
    case 'metadata': {
      const addr = args[0] || PROVIDER_ADDR;
      if (!addr) fatal('provider address required');
      const meta = await broker.inference.getServiceMetadata(addr);
      result = { endpoint: meta.endpoint, model: meta.model };
      break;
    }

    case 'headers': {
      const addr = args[0] || PROVIDER_ADDR;
      if (!addr) fatal('provider address required');
      const headers = await broker.inference.getRequestHeaders(addr);
      result = { headers };
      break;
    }

    case 'process': {
      // args: providerAddress chatID usageData
      const [addr, chatID, usageData] = args;
      if (!addr || !chatID) fatal('process requires: providerAddress chatID [usageData]');
      await broker.inference.processResponse(addr, chatID, usageData || '{}');
      result = { ok: true };
      break;
    }

    case 'acknowledge': {
      const addr = args[0] || PROVIDER_ADDR;
      if (!addr) fatal('provider address required');
      await broker.inference.acknowledgeProviderSigner(addr);
      result = { ok: true };
      break;
    }

    case 'balance': {
      const addr = args[0] || PROVIDER_ADDR;
      if (!addr) fatal('provider address required');
      const account = await broker.ledger.getLedger(addr);
      // tuple: account[1] = totalBalance, account[2] = availableBalance
      result = {
        total_balance: account[1]?.toString() ?? '0',
        available_balance: account[2]?.toString() ?? '0',
      };
      break;
    }

    case 'list': {
      const services = await broker.inference.listService();
      // tuple arrays: s[0]=providerAddress, s[1]=serviceType, s[6]=model, s[10]=teeVerified
      result = {
        services: services.map((s) => ({
          provider_address: s[0],
          service_type: s[1],
          model: s[6],
          tee_verified: s[10],
        })),
      };
      break;
    }

    default:
      fatal(`unknown command: ${command}`);
  }

  console.log(JSON.stringify(result));
} catch (err) {
  fatal(err.message || String(err));
}
