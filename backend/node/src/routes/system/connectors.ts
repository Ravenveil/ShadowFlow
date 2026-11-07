/**
 * routes/system/connectors.ts — 连接器注册表 REST 端点（2026-11-07，OpenBot 对齐批）。
 *
 *   GET  /api/connectors             → 连接器列表（含策略；默认走探测缓存）
 *   POST /api/connectors/refresh     → 强制重扫（PATH + TCP-ping）
 *   POST /api/connectors/:id/policy  → 更新策略 {enabled?, approval_mode?}
 *
 * 策略（enabled / approval_mode）是工具执行「执行前裁定」的依据；
 * 每次策略变更记入 action-journal（tool_name: connector.policy）。
 * 形状镜像 routes/system/acp.ts：路由只做 HTTP shape 转换，业务在
 * lib/connector-registry + lib/action-journal。
 */

import { Router, type Request, type Response } from 'express';
import {
  listConnectors,
  setConnectorPolicy,
  getConnectorPolicy,
  type ApprovalMode,
} from '../../lib/connector-registry';
import { recordAction } from '../../lib/action-journal';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json(await listConnectors());
  } catch (err) {
    res.status(500).json({ error: 'list failed', message: (err as Error).message });
  }
});

router.post('/refresh', async (_req: Request, res: Response) => {
  try {
    res.json(await listConnectors({ refresh: true }));
  } catch (err) {
    res.status(500).json({ error: 'refresh failed', message: (err as Error).message });
  }
});

router.post('/:id/policy', (req: Request, res: Response) => {
  const id = req.params.id;
  if (!id || id.length > 128) {
    res.status(400).json({ error: 'invalid connector id' });
    return;
  }
  const body = (req.body ?? {}) as { enabled?: unknown; approval_mode?: unknown };
  const patch: { enabled?: boolean; approval_mode?: ApprovalMode } = {};
  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
  if (body.approval_mode === 'auto' || body.approval_mode === 'prompt' || body.approval_mode === 'block') {
    patch.approval_mode = body.approval_mode;
  }
  if (patch.enabled === undefined && patch.approval_mode === undefined) {
    res.status(400).json({
      error: 'invalid policy patch',
      message: 'expect {enabled?: boolean, approval_mode?: "auto"|"prompt"|"block"}',
    });
    return;
  }
  try {
    const before = getConnectorPolicy(id);
    const policy = setConnectorPolicy(id, patch);
    recordAction({
      tool_name: 'connector.policy',
      phase: 'decided',
      decision: policy.approval_mode === 'block' ? 'block' : 'auto',
      detail: { connector_id: id, before, after: policy },
    });
    res.json({ id, policy });
  } catch (err) {
    res.status(500).json({ error: 'policy update failed', message: (err as Error).message });
  }
});

export default router;
