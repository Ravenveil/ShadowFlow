/**
 * scripts/upload-evidence.mjs
 *
 * 上传文件到 0G Storage testnet，输出 rootHash (CID)。
 *
 * 用法:
 *   ZEROG_PRIVATE_KEY=0x... node scripts/upload-evidence.mjs <filepath>
 *
 * 或在 .env 里配置 ZEROG_PRIVATE_KEY，然后：
 *   node scripts/upload-evidence.mjs README.md
 *
 * 输出示例:
 *   Root hash (CID): 0xabc123…
 *   TX hash: 0xdef456…
 *   View at: https://storagescan-galileo.0g.ai/file/0xabc123…
 *
 * 0G Storage 关键规则（来自 .0g-skills/CLAUDE.md）：
 *   - indexer.upload(file, rpcUrl, signer) 返回 [result, error] tuple
 *   - ZgFile 必须在 finally 块里 file.close()
 *   - 使用 ethers v6 (JsonRpcProvider, Wallet)
 *   - 私钥从 .env ZEROG_PRIVATE_KEY 读取，永不硬编码
 */

import { ethers } from 'ethers';
import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// Load .env from project root
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Manual dotenv parsing (avoid dependency on dotenv in mjs context)
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key && val && !process.env[key]) {
      process.env[key] = val;
    }
  }
}

const RPC_URL = process.env.ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const INDEXER_URL =
  process.env.ZEROG_STORAGE_INDEXER ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const SCAN_BASE = 'https://storagescan-galileo.0g.ai/file';

/**
 * Upload a local file to 0G Storage testnet.
 * Returns { rootHash, txHash }.
 */
async function uploadFile(filePath) {
  const privateKey = process.env.ZEROG_PRIVATE_KEY;
  if (!privateKey || privateKey.trim() === '') {
    console.error('');
    console.error('❌ ZEROG_PRIVATE_KEY not set (or empty) in .env');
    console.error('');
    console.error('To upload, set the key in .env:');
    console.error('  ZEROG_PRIVATE_KEY=0x<your-private-key>');
    console.error('');
    console.error('Or pass it inline:');
    console.error('  ZEROG_PRIVATE_KEY=0x... node scripts/upload-evidence.mjs README.md');
    console.error('');
    process.exit(1);
  }

  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ File not found: ${absolutePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(absolutePath);
  console.log(`Uploading: ${absolutePath} (${stats.size} bytes)`);
  console.log(`  RPC:     ${RPC_URL}`);
  console.log(`  Indexer: ${INDEXER_URL}`);
  console.log('');

  // ethers v6 — JsonRpcProvider (not providers.JsonRpcProvider)
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(privateKey, provider);
  console.log(`  Wallet:  ${signer.address}`);

  const indexer = new Indexer(INDEXER_URL);

  // ZgFile.fromFilePath — Node.js file handle wrapper
  // MUST be closed in finally block (0G storage rule)
  let file = null;
  try {
    file = await ZgFile.fromFilePath(absolutePath);

    // Compute Merkle tree to get the root hash (CID) before upload
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr || !tree) {
      throw new Error(`Merkle tree generation failed: ${treeErr ?? 'no tree returned'}`);
    }
    const rootHash = tree.rootHash();
    if (!rootHash) {
      throw new Error('Merkle tree returned empty root hash');
    }
    console.log(`  Root hash (CID): ${rootHash}`);

    // indexer.upload returns [result, error] tuple — never throw directly
    console.log('Uploading to 0G Storage...');
    const [uploadResult, uploadErr] = await indexer.upload(file, RPC_URL, signer);
    if (uploadErr) {
      throw new Error(`0G Storage upload failed: ${uploadErr.message ?? String(uploadErr)}`);
    }

    // uploadResult has shape { txHash: string, rootHash: string }
    const txHash = uploadResult?.txHash ?? 'N/A';
    const confirmedRoot = uploadResult?.rootHash ?? rootHash;

    console.log('');
    console.log('✅ Upload successful!');
    console.log(`  Root hash (CID): ${confirmedRoot}`);
    console.log(`  TX hash:         ${txHash}`);
    console.log(`  View at:         ${SCAN_BASE}/${confirmedRoot}`);
    console.log('');
    console.log('--- evidenceCids.ts snippet ---');
    const shortHash = `${confirmedRoot.slice(0, 8)}…${confirmedRoot.slice(-4)}`;
    console.log(JSON.stringify(
      {
        cid: confirmedRoot,
        shortHash,
        merkleRoot: confirmedRoot,
        explorerUrl: `${SCAN_BASE}/${confirmedRoot}`,
      },
      null,
      2
    ));

    return { rootHash: confirmedRoot, txHash };
  } finally {
    // ALWAYS close ZgFile in finally — 0G storage critical rule
    if (file) {
      await file.close();
    }
  }
}

// --- Main ---
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/upload-evidence.mjs <filepath>');
  console.error('Example: node scripts/upload-evidence.mjs README.md');
  process.exit(1);
}

uploadFile(filePath).catch((err) => {
  console.error('❌ Upload failed:', err.message ?? String(err));
  process.exit(1);
});
