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

function mockFetchOk(body: ArrayBuffer | string): void {
  const buffer = typeof body === 'string'
    ? new TextEncoder().encode(body).buffer
    : body;
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(buffer),
  } as unknown as Response);
}

function mockFetchFail(status: number): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response);
}

describe('downloadTrajectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetchOk(new ArrayBuffer(0));
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
      downloadTrajectory(VALID_CID).catch((e) => (e as InstanceType<typeof MerkleVerificationError>).errorType),
    ).resolves.toBe('not_found');
  });

  it('sets errorType=verification_failed for generic errors', async () => {
    mockDownload.mockRejectedValue(new Error('some internal error'));
    await expect(
      downloadTrajectory(VALID_CID).catch((e) => (e as InstanceType<typeof MerkleVerificationError>).errorType),
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

  it('parses JSON trajectory from gateway bytes (Story 5.5)', async () => {
    mockDownload.mockResolvedValue(null);
    const traj = { metadata: { author_lineage: ['alex@12345678'] } };
    mockFetchOk(JSON.stringify(traj));
    const result = await downloadTrajectory(VALID_CID);
    expect(result.verified).toBe(true);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.trajectory?.metadata?.author_lineage).toEqual(['alex@12345678']);
  });

  it('returns undefined trajectory when bytes are not valid JSON', async () => {
    mockDownload.mockResolvedValue(null);
    mockFetchOk('not-json-payload');
    const result = await downloadTrajectory(VALID_CID);
    expect(result.verified).toBe(true);
    expect(result.trajectory).toBeUndefined();
  });

  it('throws gateway_error when HTTP gateway returns 4xx/5xx', async () => {
    mockDownload.mockResolvedValue(null);
    mockFetchFail(404);
    await expect(downloadTrajectory(VALID_CID)).rejects.toThrow(MerkleVerificationError);
    await expect(
      downloadTrajectory(VALID_CID).catch((e) => (e as InstanceType<typeof MerkleVerificationError>).errorType),
    ).resolves.toBe('gateway_error');
  });
});
