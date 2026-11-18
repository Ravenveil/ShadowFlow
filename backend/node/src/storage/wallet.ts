/**
 * wallet.ts — 单后端迁移：/api/wallet/* 的 Node 数据层（移植自 Python
 * backend/python/shadowflow/api/system/wallet.py）。
 *
 * 存储：<repo>/.shadowflow/wallet.json，只读；文件缺失/损坏时用设计默认值兜底。
 * 与 Python 逐字段对齐，legacy↔single 共享同一文件。
 */

import fs from 'fs';
import { repoDataFile } from './repo-root';

export interface WalletStats {
  teams_published: number;
  cids_held: number;
  gas_budget_og: number;
  citations: number;
}

export interface WalletStatus {
  connected: boolean;
  network: string;
  address_masked: string;
  address_full: string;
  stats: WalletStats;
}

export interface WalletActivityItem {
  timestamp: string;
  op: string;
  label: string;
  cid: string;
  status: string;
}

export interface SkinPackSlot {
  slot: string;
  value: string;
}

const DEFAULT_WALLET = {
  connected: true,
  network: '0G Galileo Testnet',
  address: '0x3f7a4d12ab98bc91e2d5c4f8a6b0e1d3c5f7a9b1',
  stats: {
    teams_published: 3,
    cids_held: 12,
    gas_budget_og: 0.42,
    citations: 7,
  },
  activity: [
    { timestamp: '09:14', op: 'team.publish', label: '论文深读小队', cid: 'cid://Qm…3bx2a', status: 'ok' },
    { timestamp: '昨日', op: 'team.fork', label: 'from Newsroom', cid: 'cid://Qm…f0d12', status: 'ok' },
    { timestamp: '昨日', op: 'team.update', label: 'Rebuttal 起草', cid: 'cid://Qm…99cda', status: 'warn' },
  ],
  skin_pack: [
    { slot: 'bg', value: '#0A0A0A' },
    { slot: 'panel', value: '#0F0F12' },
    { slot: 'fg', value: '#FAFAFA' },
    { slot: 'muted', value: '#A1A1AA' },
    { slot: 'accent', value: '#A855F7' },
    { slot: 'ink', value: '#0A0A0A' },
    { slot: 'border', value: '#27272A' },
  ],
};

type RawWallet = {
  connected?: unknown;
  network?: unknown;
  address?: unknown;
  stats?: Record<string, unknown>;
  activity?: unknown;
  skin_pack?: unknown;
};

/** 读取 wallet.json（浅合并默认值，嵌套字段兜底）——与 Python _read_wallet 一致。 */
export function readWallet(): typeof DEFAULT_WALLET {
  const file = repoDataFile('wallet.json');
  let data: RawWallet = {};
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    }
  } catch {
    // 损坏 → 用默认值
  }
  return {
    connected: typeof data.connected === 'boolean' ? data.connected : DEFAULT_WALLET.connected,
    network: typeof data.network === 'string' ? data.network : DEFAULT_WALLET.network,
    address: typeof data.address === 'string' ? data.address : DEFAULT_WALLET.address,
    stats: { ...DEFAULT_WALLET.stats, ...(data.stats && typeof data.stats === 'object' ? data.stats : {}) } as WalletStats,
    activity: Array.isArray(data.activity) ? (data.activity as WalletActivityItem[]) : DEFAULT_WALLET.activity,
    skin_pack: Array.isArray(data.skin_pack) ? (data.skin_pack as SkinPackSlot[]) : DEFAULT_WALLET.skin_pack,
  };
}

/** 掩码地址：0x3f7a4d12ab98… → 0x3f7a · 4d12 · ab98 · bc91（前16 hex，4位一组）。 */
export function maskAddress(address: string): string {
  if (typeof address !== 'string' || !address) return '';
  const lower = address.toLowerCase();
  const has0x = lower.startsWith('0x');
  const body = has0x ? lower.slice(2) : lower;
  const chunks: string[] = [];
  for (let i = 0; i < Math.min(16, body.length); i += 4) chunks.push(body.slice(i, i + 4));
  if (!chunks.length) return has0x ? '0x' : '';
  const prefix = has0x ? '0x' : '';
  return prefix + chunks[0] + (chunks.length > 1 ? ' · ' + chunks.slice(1).join(' · ') : '');
}

export function walletStatus(): WalletStatus {
  const w = readWallet();
  return {
    connected: !!w.connected,
    network: String(w.network ?? '0G Galileo Testnet'),
    address_masked: maskAddress(String(w.address ?? '')),
    address_full: String(w.address ?? ''),
    stats: {
      teams_published: Number(w.stats?.teams_published ?? 0),
      cids_held: Number(w.stats?.cids_held ?? 0),
      gas_budget_og: Number(w.stats?.gas_budget_og ?? 0),
      citations: Number(w.stats?.citations ?? 0),
    },
  };
}

export function walletActivity(): { items: WalletActivityItem[] } {
  const items: WalletActivityItem[] = [];
  for (const raw of readWallet().activity ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    items.push({
      timestamp: String(r.timestamp ?? ''),
      op: String(r.op ?? ''),
      label: String(r.label ?? ''),
      cid: String(r.cid ?? ''),
      status: String(r.status ?? 'ok'),
    });
  }
  return { items };
}

export function walletSkinPack(): { slots: SkinPackSlot[] } {
  const slots: SkinPackSlot[] = [];
  for (const raw of readWallet().skin_pack ?? []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const slot = String(r.slot ?? '').trim();
    const value = String(r.value ?? '').trim();
    if (slot && value) slots.push({ slot, value });
  }
  return { slots };
}
