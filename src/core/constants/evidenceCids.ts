export interface EvidenceCid {
  cid: string;
  shortHash: string;
  templateName: string;
  templateAlias: string;
  merkleRoot: string;
  archivedAt: string;
  authorLineage: string[];
  explorerUrl: string;
  description: string;
  /** true = CID was uploaded and confirmed on 0G Storage testnet; false = placeholder for demo */
  isPlaceholder?: boolean;
}

// ⚠️ PLACEHOLDER CIDs — real upload required before hackathon demo.
//
// To obtain real CIDs:
//   1. Set ZEROG_PRIVATE_KEY=0x<key> in .env (never commit the real key)
//   2. Run: node scripts/upload-evidence.mjs <trajectory-file.json>
//      (trajectory JSON is produced by a completed ShadowFlow run)
//   3. Copy the "Root hash (CID)" from stdout and replace the cid/merkleRoot fields below
//   4. Verify the file is live: https://storagescan-galileo.0g.ai/file/<rootHash>
//   5. Update explorerUrl to point to the confirmed rootHash
//
// The upload script handles all 0G Storage rules automatically:
//   - ZgFile.fromFilePath + finally { file.close() }
//   - indexer.upload(file, rpcUrl, signer) → [result, error] tuple
//   - ethers v6 JsonRpcProvider / Wallet
export const EVIDENCE_CIDS: EvidenceCid[] = [
  {
    // PLACEHOLDER — run: node scripts/upload-evidence.mjs <trajectory.json>
    cid: '0x3f7abc1d2e4f8901a2b3c4d5e6f70123456789abcdef0123456789abcdef0123',
    shortHash: '3f7abc…0123',
    templateName: 'Academic Paper',
    templateAlias: 'academic_paper',
    merkleRoot: '0x3f7abc1d2e4f8901a2b3c4d5e6f70123456789abcdef0123456789abcdef0123',
    archivedAt: '2026-04-24T06:00:00Z',
    authorLineage: ['shadowflow-ravenveil', 'academic-paper-v1'],
    explorerUrl:
      'https://storagescan-galileo.0g.ai/file/0x3f7abc1d2e4f8901a2b3c4d5e6f70123456789abcdef0123456789abcdef0123',
    description:
      'Academic Paper 模板的首次真实运行轨迹——5 Agent 协作（规划 / 文献综述 / 写作 / 评审 / 发布），含完整 Policy Matrix 与导师驳回门记录。(demo — 待真实上传替换)',
    isPlaceholder: true,
  },
];
