import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @0glabs/0g-ts-sdk
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockMerkleTree = vi.fn().mockResolvedValue([{ rootHash: () => 'mock-root-hash' }, null]);
const mockUpload = vi.fn().mockResolvedValue(['mock-tx-hash', null]);

vi.mock('@0glabs/0g-ts-sdk', () => {
  function MockIndexer() { return { upload: mockUpload }; }
  return {
    ZgFile: {
      fromBlob: vi.fn().mockResolvedValue({
        merkleTree: mockMerkleTree,
        close: mockClose,
      }),
    },
    Indexer: MockIndexer,
  };
});

// Mock ethers v6
vi.mock('ethers', () => {
  function MockJsonRpcProvider() { return {}; }
  function MockWallet() { return { address: '0xmock' }; }
  return {
    ethers: {
      JsonRpcProvider: MockJsonRpcProvider,
      Wallet: MockWallet,
    },
  };
});

// Mock secrets store
vi.mock('@/core/hooks/useZerogSecretsStore', () => ({
  useZerogSecretsStore: {
    getState: () => ({
      getPrivateKey: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(32)),
    }),
  },
}));

const { uploadTrajectory } = await import('../zerogStorage');

describe('uploadTrajectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns cid and txHash on successful upload', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await uploadTrajectory(data, 'testpass');

    expect(result.cid).toBe('mock-root-hash');
    expect(result.txHash).toBe('mock-tx-hash');
  });

  it('closes ZgFile in finally block even on success', async () => {
    const data = new Uint8Array([4, 5, 6]);
    await uploadTrajectory(data, 'testpass');
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes ZgFile when merkle tree generation fails', async () => {
    mockMerkleTree.mockResolvedValueOnce([null, 'merkle error']);
    const data = new Uint8Array([7, 8, 9]);
    await expect(uploadTrajectory(data, 'testpass')).rejects.toThrow('Merkle tree generation failed');
    expect(mockClose).toHaveBeenCalled();
  });

  it('closes ZgFile when upload returns error tuple', async () => {
    mockUpload.mockResolvedValueOnce([null, new Error('network failure')]);
    const data = new Uint8Array([10, 11]);
    await expect(uploadTrajectory(data, 'testpass')).rejects.toThrow('0G Storage upload failed');
    expect(mockClose).toHaveBeenCalled();
  });
});
