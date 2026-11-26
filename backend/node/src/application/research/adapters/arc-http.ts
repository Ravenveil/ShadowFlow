/**
 * research 域 — Web 适配层（薄壳）
 *
 * GET /api/arc/pipeline                → 23 阶段目录（相位 / 审批门）
 * GET /api/arc/runs                    → run 摘要卡（进度 / 状态 / 课题）
 * GET /api/arc/runs/:runId             → run 详情（阶段视图 + 终稿 + 核验 + 质量门）
 * GET /api/arc/runs/:runId/artifact    → 文本产物截头（?path= 相对路径）
 * GET /api/arc/runs/:runId/raw         → 二进制产物流（?path=，pdf / 图直链）
 *
 * 只做 HTTP ↔ 用例映射，状态推断在 model、扫描在 infra。
 */

import { Router, Request, Response } from 'express';

import { createArcFsReader } from '../infra/arc-fs.reader';
import { ARC_PIPELINE } from '../arc-model';
import { getRunDetail, listRuns, rawArtifact, readArtifact, type ArcDeps, type Result } from '../use_cases/arc-runs';

function fail(res: Response, result: Result<unknown>): boolean {
  switch (result.kind) {
    case 'ok':
      return false;
    case 'not_found':
      res.status(404).json({ error: { code: 'ARC_RUN_NOT_FOUND', message: 'run 不存在' } });
      return true;
    case 'invalid':
      res.status(400).json({ error: { code: result.code, message: 'run id 不合法' } });
      return true;
  }
}

function relPathOf(req: Request): string | null {
  const value = req.query.path;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** `?root=` 把 reader 收窄到某个目录（会话工作目录，或直接装着 run 的根）；缺省用全局默认根。 */
function depsOf(req: Request): ArcDeps {
  const root = typeof req.query.root === 'string' ? req.query.root.trim() : '';
  // 每次请求现算：默认根里的会话工作目录是运行中才建出来的，启动时冻结的清单会漏掉它
  return { reader: createArcFsReader(root ? [root] : undefined) };
}

export function createArcRouter(): Router {
  const router = Router();

  router.get('/pipeline', (_req: Request, res: Response) => {
    res.json({ data: ARC_PIPELINE });
  });

  router.get('/runs', async (req: Request, res: Response) => {
    try {
      res.json({ data: await listRuns(depsOf(req)) });
    } catch (err) {
      res.status(500).json({
        error: { code: 'ARC_SCAN_FAILED', message: err instanceof Error ? err.message : 'scan failed' },
      });
    }
  });

  router.get('/runs/:runId', async (req: Request, res: Response) => {
    const result = await getRunDetail(depsOf(req), req.params.runId);
    if (fail(res, result)) return;
    res.json({ data: result.kind === 'ok' ? result.value : null });
  });

  router.get('/runs/:runId/artifact', async (req: Request, res: Response) => {
    const relPath = relPathOf(req);
    if (!relPath) {
      res.status(400).json({ error: { code: 'BAD_PATH', message: '缺少 path 参数' } });
      return;
    }
    const result = await readArtifact(depsOf(req), req.params.runId, relPath);
    if (fail(res, result)) return;
    res.json({ data: result.kind === 'ok' ? result.value : null });
  });

  router.get('/runs/:runId/raw', async (req: Request, res: Response) => {
    const relPath = relPathOf(req);
    if (!relPath) {
      res.status(400).json({ error: { code: 'BAD_PATH', message: '缺少 path 参数' } });
      return;
    }
    const result = await rawArtifact(depsOf(req), req.params.runId, relPath);
    if (fail(res, result)) return;
    const file = result.kind === 'ok' ? result.value : null;
    if (!file) {
      res.status(404).json({ error: { code: 'ARC_RUN_NOT_FOUND', message: '文件不存在' } });
      return;
    }
    res.sendFile(file, (err) => {
      if (!err) return;
      if (!res.headersSent) {
        res.status(500).json({ error: { code: 'ARC_RAW_FAILED', message: 'send failed' } });
      } else {
        res.end();
      }
    });
  });

  return router;
}

export default createArcRouter();
