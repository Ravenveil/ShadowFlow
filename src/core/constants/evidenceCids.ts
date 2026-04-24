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
}

// ⚠️ DEMO PREP REQUIRED (AR32):
// Replace with real CIDs obtained from 0G Storage uploads before hackathon demo.
// Steps:
//   1. Run the ShadowFlow editor with Academic Paper or Solo Company template
//   2. Execute a real run end-to-end
//   3. Upload the trajectory to 0G Storage via Story 5.x upload flow
//   4. Copy the returned CID here and verify at: https://chainscan-galileo.0g.ai
//   5. Manually click the Explorer link to confirm it returns a real page (AC2 AR32)
export const EVIDENCE_CIDS: EvidenceCid[] = [
  {
    cid: '0x3f7abc1d2e4f8901a2b3c4d5e6f70123456789abcdef0123456789abcdef0123',
    shortHash: '3f7abc…0123',
    templateName: 'Academic Paper',
    templateAlias: 'academic_paper',
    merkleRoot: '0xa1b2c3d4e5f60789012345678901234567890123456789012345678901234567',
    archivedAt: '2026-04-24T06:00:00Z',
    authorLineage: ['shadowflow-ravenveil', 'academic-paper-v1'],
    explorerUrl: 'https://chainscan-galileo.0g.ai/tx/0x3f7abc1d2e4f8901a2b3c4d5e6f70123456789abcdef0123456789abcdef0123',
    description: 'Academic Paper 模板的首次真实运行轨迹——5 Agent 协作（规划 / 文献综述 / 写作 / 评审 / 发布），含完整 Policy Matrix 与导师驳回门记录。',
  },
];
