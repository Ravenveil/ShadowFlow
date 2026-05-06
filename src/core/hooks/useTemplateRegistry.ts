import { ethers } from 'ethers';
import { Indexer, ZgFile } from '@0glabs/0g-ts-sdk';
import { useCallback, useEffect, useState } from 'react';

const _ENV = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const REGISTRY_ADDRESS = _ENV.VITE_TEMPLATE_REGISTRY_ADDRESS ?? '';
const RPC_URL = _ENV.VITE_ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';

const ABI = [
  'function listTemplates(uint256 offset, uint256 limit) view returns (bytes32[] ids, tuple(string cid, address creator, uint256 price, uint256 salesCount, bool active, string title, string description)[] templates)',
  'function lookup(bytes32 templateId) view returns (tuple(string cid, address creator, uint256 price, uint256 salesCount, bool active, string title, string description))',
  'function isOwned(address buyer, bytes32 templateId) view returns (bool)',
  'function totalTemplates() view returns (uint256)',
  'function publish(bytes32 templateId, string cid, uint256 price, string title, string description)',
  'function purchase(bytes32 templateId) payable',
  'function withdraw()',
  'function pendingEarnings(address creator) view returns (uint256)',
];

export interface MarketTemplate {
  id: string;           // bytes32 hex
  cid: string;
  creator: string;
  price: bigint;        // wei
  priceEth: string;     // formatted A0GI
  salesCount: number;
  active: boolean;
  title: string;
  description: string;
}

export function encodeTemplateId(uuid: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(uuid));
}

function readonlyContract() {
  if (!REGISTRY_ADDRESS) return null;
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return new ethers.Contract(REGISTRY_ADDRESS, ABI, provider);
}

async function signerContract() {
  if (!REGISTRY_ADDRESS) throw new Error('合约地址未配置');
  const _win = window as { ethereum?: ethers.Eip1193Provider };
  if (!_win.ethereum) throw new Error('请安装 MetaMask');
  const provider = new ethers.BrowserProvider(_win.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(REGISTRY_ADDRESS, ABI, signer);
}

function parseTemplate(id: string, raw: { cid: string; creator: string; price: bigint; salesCount: bigint; active: boolean; title: string; description: string }): MarketTemplate {
  return {
    id,
    cid: raw.cid,
    creator: raw.creator,
    price: raw.price,
    priceEth: ethers.formatEther(raw.price),
    salesCount: Number(raw.salesCount),
    active: raw.active,
    title: raw.title,
    description: raw.description,
  };
}

// ── Hooks ────────────────────────────────────────────────────────────────────

export function useMarketplace() {
  const [templates, setTemplates] = useState<MarketTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contractDeployed = !!REGISTRY_ADDRESS;

  const fetch = useCallback(async (offset = 0, limit = 50) => {
    if (!REGISTRY_ADDRESS) return;
    setLoading(true);
    setError(null);
    try {
      const contract = readonlyContract()!;
      type RawTemplate = { cid: string; creator: string; price: bigint; salesCount: bigint; active: boolean; title: string; description: string };
      const [ids, raws] = await contract.listTemplates(offset, limit) as [string[], RawTemplate[]];
      const parsed: MarketTemplate[] = ids.map((id, i) => parseTemplate(id, raws[i]));
      setTemplates(parsed.filter((t) => t.active));
    } catch (e) {
      setError(e instanceof Error ? e.message : '无法连接 0G Chain');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return { templates, loading, error, contractDeployed, refetch: fetch };
}

export function useIsOwned(templateId: string | null, buyerAddress: string | null) {
  const [owned, setOwned] = useState<boolean | null>(null);

  useEffect(() => {
    if (!templateId || !buyerAddress || !REGISTRY_ADDRESS) return;
    readonlyContract()!
      .isOwned(buyerAddress, templateId)
      .then((v: boolean) => setOwned(v))
      .catch(() => setOwned(null));
  }, [templateId, buyerAddress]);

  return owned;
}

// ── Write actions (require MetaMask) ─────────────────────────────────────────

export async function publishTemplate(params: {
  uuid: string;
  cid: string;
  priceEth: string;   // "0" for free
  title: string;
  description: string;
}): Promise<string> {
  const contract = await signerContract();
  const templateId = encodeTemplateId(params.uuid);
  const price = ethers.parseEther(params.priceEth);
  const tx = await contract.publish(templateId, params.cid, price, params.title, params.description);
  await tx.wait();
  return templateId;
}

export async function purchaseTemplate(templateId: string, price: bigint): Promise<void> {
  const contract = await signerContract();
  const tx = await contract.purchase(templateId, { value: price });
  await tx.wait();
}

export async function withdrawEarnings(): Promise<void> {
  const contract = await signerContract();
  const tx = await contract.withdraw();
  await tx.wait();
}

export async function getPendingEarnings(creatorAddress: string): Promise<string> {
  const contract = readonlyContract();
  if (!contract) return '0';
  const wei: bigint = await contract.pendingEarnings(creatorAddress);
  return ethers.formatEther(wei);
}

// ── 0G Storage upload via MetaMask (no server-side key required) ──────────────

const STORAGE_INDEXER =
  _ENV.VITE_ZEROG_STORAGE_INDEXER ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const UPLOAD_TIMEOUT_MS = 120_000;

export async function uploadYamlForMarket(yamlText: string): Promise<string> {
  const _win = window as { ethereum?: ethers.Eip1193Provider };
  if (!_win.ethereum) throw new Error('请安装 MetaMask');

  const bytes = new TextEncoder().encode(yamlText);
  // ZgFile type definitions lag the actual API; cast to access fromBlob
  const ZgFileAny = ZgFile as unknown as {
    fromBlob: (blob: Blob) => Promise<{ merkleTree: () => Promise<[{ rootHash: () => string | null }, unknown | null]>; close: () => Promise<void> }>;
  };
  const blob = new Blob([bytes], { type: 'text/yaml' });
  const file = await ZgFileAny.fromBlob(blob);

  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr || !tree) throw new Error(`Merkle tree 生成失败: ${String(treeErr ?? 'no tree')}`);
    const cid = tree.rootHash();
    if (!cid) throw new Error('Merkle tree 返回空 root hash');

    const provider = new ethers.BrowserProvider(_win.ethereum);
    const signer = await provider.getSigner();
    const indexer = new Indexer(STORAGE_INDEXER);

    await Promise.race([
      (async () => {
        // indexer.upload: (file, rpcUrl, signer) — signer type mismatch is a lib issue only
        const [, err] = await (indexer as unknown as {
          upload: (f: unknown, rpc: string, s: unknown) => Promise<[unknown, { message: string } | null]>
        }).upload(file, RPC_URL, signer);
        if (err) throw new Error(`0G Storage 上传失败: ${err.message}`);
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('0G Storage 上传超时 (120s)')), UPLOAD_TIMEOUT_MS)
      ),
    ]);

    return cid;
  } finally {
    await file.close();
  }
}
