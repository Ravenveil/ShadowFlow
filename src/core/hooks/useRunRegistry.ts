import { ethers } from 'ethers';
import { useCallback, useEffect, useRef, useState } from 'react';

const REGISTRY_ADDRESS = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_RUN_REGISTRY_ADDRESS ?? '';
const RPC_URL = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ZEROG_RPC_URL ?? 'https://evmrpc-testnet.0g.ai';

const REGISTRY_ABI = [
  'function lookup(bytes32 runId) view returns (string cid, address registrar, uint256 timestamp)',
];

export type RegistryStatus = 'idle' | 'pending' | 'confirmed' | 'not-found' | 'error';

export interface RegistryEntry {
  cid: string;
  registrar: string;
  timestamp: number;
  status: RegistryStatus;
}

/**
 * Encode a run UUID to bytes32 for the contract.
 * NEVER use encodeBytes32String — UUID (36 chars) > 31-byte limit.
 */
export function encodeRunId(runId: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(runId));
}

/**
 * Look up a single run_id in the RunRegistry contract.
 * Returns null if contract not deployed or entry not found.
 */
export async function lookupRunId(runId: string): Promise<RegistryEntry | null> {
  if (!REGISTRY_ADDRESS) return null;
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const contract = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    const encoded = encodeRunId(runId);
    const [cid, registrar, timestamp] = await contract.lookup(encoded);
    if (!registrar || registrar === ethers.ZeroAddress) return null;
    return {
      cid,
      registrar,
      timestamp: Number(timestamp),
      status: 'confirmed',
    };
  } catch {
    return null;
  }
}

/**
 * Poll the RunRegistry until the run_id appears or timeout elapses.
 * Resolves with the entry or null on timeout.
 *
 * @param runId     UUID string of the run
 * @param onUpdate  Called on each poll with current status
 * @param maxMs     Max wait time in ms (default 60 000)
 * @param intervalMs Poll interval in ms (default 5 000)
 */
export function useRunRegistryPoll(
  runId: string | null,
  onUpdate: (entry: RegistryEntry | null) => void,
  { maxMs = 60_000, intervalMs = 5_000 }: { maxMs?: number; intervalMs?: number } = {},
) {
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (deadlineRef.current) clearTimeout(deadlineRef.current);
    timerRef.current = null;
    deadlineRef.current = null;
  }, []);

  useEffect(() => {
    if (!runId || !REGISTRY_ADDRESS) return;
    cancelledRef.current = false;

    const poll = async () => {
      if (cancelledRef.current) return;
      const entry = await lookupRunId(runId);
      if (cancelledRef.current) return;
      onUpdate(entry);
      if (entry?.status === 'confirmed') stop();
    };

    poll();
    timerRef.current = setInterval(poll, intervalMs);
    deadlineRef.current = setTimeout(() => {
      stop();
      if (!cancelledRef.current) onUpdate(null);
    }, maxMs);

    return stop;
  }, [runId, intervalMs, maxMs, onUpdate, stop]);

  return { stop };
}

/**
 * Simple hook for showing the registry status of a single run.
 * Returns { entry, loading } where entry is null until found.
 */
export function useRunRegistryEntry(runId: string | null) {
  const [entry, setEntry] = useState<RegistryEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const handleUpdate = useCallback((e: RegistryEntry | null) => {
    setEntry(e);
    if (e?.status === 'confirmed') setLoading(false);
  }, []);

  useEffect(() => {
    if (!runId || !REGISTRY_ADDRESS) return;
    setLoading(true);
    setEntry(null);
  }, [runId]);

  useRunRegistryPoll(runId, handleUpdate);

  return { entry, loading, contractDeployed: !!REGISTRY_ADDRESS };
}
