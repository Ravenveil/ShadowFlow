/**
 * wallet.ts — 单后端迁移：GET /api/wallet/{status,activity,skin-pack}
 * 响应 shape 与 Python wallet.py 的 Pydantic response_model 逐字段对齐。
 */

import { Router, Request, Response } from 'express';
import { walletStatus, walletActivity, walletSkinPack } from '../../application/settings-wallet';

const router = Router();

router.get('/status', (_req: Request, res: Response) => {
  res.json(walletStatus());
});

router.get('/activity', (_req: Request, res: Response) => {
  res.json(walletActivity());
});

router.get('/skin-pack', (_req: Request, res: Response) => {
  res.json(walletSkinPack());
});

export default router;
