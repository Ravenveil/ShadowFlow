import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import { useZerogSecretsStore } from '@/core/hooks/useZerogSecretsStore';

const VITE_ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const STORAGE_INDEXER = VITE_ENV.VITE_ZEROG_STORAGE_INDEXER ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const RPC_URL = VITE_ENV.VITE_ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';

export interface UploadResult {
  cid: string;
  txHash: string;
}

export async function uploadTrajectory(
  bytes: Uint8Array,
  passphrase: string,
): Promise<UploadResult> {
  const store = useZerogSecretsStore.getState();
  const pk = await store.getPrivateKey(passphrase);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(pk, provider);
  const indexer = new Indexer(STORAGE_INDEXER);

  const blob = new Blob([bytes]);
  const file = await ZgFile.fromBlob(blob);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`Merkle tree generation failed: ${treeErr}`);

    const rootHash = tree!.rootHash();

    const [tx, uploadErr] = await indexer.upload(file, RPC_URL, signer);
    if (uploadErr) throw new Error(`0G Storage upload failed: ${uploadErr.message}`);

    return { cid: rootHash, txHash: String(tx) };
  } finally {
    await file.close();
  }
}
