import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDownload = vi.fn();

vi.mock('@0glabs/0g-ts-sdk', () => {
  function MockIndexer() { return { download: mockDownload }; }
  return {
    ZgFile: { fromBlob: vi.fn() },
    Indexer: MockIndexer,
  };
});

vi.mock('ethers', () => ({
  ethers: { JsonRpcProvider: vi.fn(), Wallet: vi.fn() },
}));

vi.mock('@/core/hooks/useZerogSecretsStore', () => ({
  useZerogSecretsStore: { getState: () => ({ getPrivateKey: vi.fn() }) },
}));

const { downloadTrajectory, MerkleVerificationError, isDownloadInFlight } =
  await import('../zerogStorage');

const VALID_CID = '0x' + 'ab'.repeat(32);

describe('downloadTrajectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects invalid CID format', async () => {
    await expect(downloadTrajectory('bad-cid')).rejects.toThrow(MerkleVerificationError);
    await expect(downloadTrajectory('bad-cid')).rejects.toThrow('Invalid CID format');
  });

  it('rejects CID without 0x prefix', async () => {
    const noPrefixCid = 'ab'.repeat(32);
    await expect(downloadTrajectory(noPrefixCid)).rejects.toThrow('Invalid CID format');
  });

  it('returns verified result on successful download', async () => {
    mockDownload.mockResolvedValue(null);
    const result = await downloadTrajectory(VALID_CID);
    expect(result.verified).toBe(true);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(mockDownload).toHaveBeenCalledWith(VALID_CID, VALID_CID, true);
  });

  it('wraps error-return path in MerkleVerificationError', async () => {
    mockDownload.mockResolvedValue(new Error('verification mismatch'));
    await expect(downloadTrajectory(VALID_CID)).rejects.toThrow(MerkleVerificationError);
    await expect(
      downloadTrajectory(VALID_CID).catch((e: Error) => e.message),
    ).resolves.toContain('Merkle 验证失败');
  });

  it('wraps throw path in MerkleVerificationError', async () => {
    mockDownload.mockRejectedValue(new Error('JsonRpcError: file not found'));
    await expect(downloadTrajectory(VALID_CID)).rejects.toThrow(MerkleVerificationError);
    await expect(
      downloadTrajectory(VALID_CID).catch((e: MerkleVerificationError) => e.errorType),
    ).resolves.toBe('not_found');
  });

  it('sets errorType=verification_failed for generic errors', async () => {
    mockDownload.mockRejectedValue(new Error('some internal error'));
    await expect(
      downloadTrajectory(VALID_CID).catch((e: MerkleVerificationError) => e.errorType),
    ).resolves.toBe('verification_failed');
  });

  it('throws timeout error after 15s', async () => {
    mockDownload.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    const promise = downloadTrajectory(VALID_CID);
    vi.advanceTimersByTime(15_001);
    await expect(promise).rejects.toThrow('下载超时');
  });

  it('clears in-flight state after success', async () => {
    mockDownload.mockResolvedValue(null);
    await downloadTrajectory(VALID_CID);
    expect(isDownloadInFlight()).toBe(false);
  });

  it('clears in-flight state after error', async () => {
    mockDownload.mockRejectedValue(new Error('fail'));
    await downloadTrajectory(VALID_CID).catch(() => {});
    expect(isDownloadInFlight()).toBe(false);
  });
});
