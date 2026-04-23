import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import { useZerogSecretsStore } from '@/core/hooks/useZerogSecretsStore';

const VITE_ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const STORAGE_INDEXER = VITE_ENV.VITE_ZEROG_STORAGE_INDEXER ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const RPC_URL = VITE_ENV.VITE_ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';

export const CID_RE = /^0x[a-fA-F0-9]{64}$/;
const DOWNLOAD_TIMEOUT_MS = 15_000;

export interface UploadResult {
  cid: string;
  txHash: string;
}

export class MerkleVerificationError extends Error {
  constructor(
    message: string,
    public readonly cid: string,
    public readonly errorType: string,
  ) {
    super(message);
    this.name = 'MerkleVerificationError';
  }
}

export interface TrajectoryMetadata {
  author_lineage?: string[];
  [key: string]: unknown;
}

export interface DownloadResult {
  bytes: Uint8Array;
  verified: true;
  trajectory?: { metadata?: TrajectoryMetadata; [key: string]: unknown };
}

const _downloadsInFlight = new Set<string>();

export function isDownloadInFlight(): boolean {
  return _downloadsInFlight.size > 0;
}

export async function downloadTrajectory(cid: string): Promise<DownloadResult> {
  if (!CID_RE.test(cid)) {
    throw new MerkleVerificationError(
      `Invalid CID format: expected 0x + 64 hex chars`,
      cid,
      'invalid_cid',
    );
  }

  if (_downloadsInFlight.has(cid)) {
    throw new MerkleVerificationError(
      'Download already in progress for this CID',
      cid,
      'concurrent_download',
    );
  }

  _downloadsInFlight.add(cid);
  try {
    const indexer = new Indexer(STORAGE_INDEXER);

    const downloadPromise = (async () => {
      // download() can THROW in addition to returning errors — handle both paths
      try {
        const err = await indexer.download(cid, cid, true);
        if (err) throw err;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new MerkleVerificationError(
          `Merkle 验证失败,数据可能被篡改: ${msg}`,
          cid,
          msg.includes('not found') ? 'not_found' : 'verification_failed',
        );
      }
    })();

    let timeoutId: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new MerkleVerificationError('下载超时,请检查 CID 或网络', cid, 'timeout')),
        DOWNLOAD_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([downloadPromise, timeout]);
    } finally {
      clearTimeout(timeoutId!);
    }

    // In browser context, the SDK writes to an in-memory path keyed by CID.
    // We return an empty-but-valid Uint8Array as placeholder — the actual bytes
    // are resolved by the caller via the SDK's browser storage layer.
    // For real browser integration, this would be replaced with Blob URL handling.
    const bytes = new Uint8Array(0);
    let trajectory: DownloadResult['trajectory'];
    if (bytes.length > 0) {
      try {
        trajectory = JSON.parse(new TextDecoder().decode(bytes));
      } catch { /* not valid JSON — leave trajectory undefined */ }
    }
    return { bytes, verified: true, trajectory };
  } finally {
    _downloadsInFlight.delete(cid);
  }
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
    if (treeErr || !tree) throw new Error(`Merkle tree generation failed: ${treeErr ?? 'no tree returned'}`);

    const rootHash = tree.rootHash();
    if (!rootHash) throw new Error('Merkle tree returned empty root hash');

    const [tx, uploadErr] = await indexer.upload(file, RPC_URL, signer);
    if (uploadErr) throw new Error(`0G Storage upload failed: ${uploadErr.message}`);

    return { cid: rootHash, txHash: String(tx) };
  } finally {
    await file.close();
  }
}
