/**
 * api-guard.ts — 写接口的最小访问控制（2026-11-05，功能线①③加固）。
 *
 * 为什么需要：`/api/merchant/*` 有 5 个写接口（建商品 / 埋点 / 下单 / 支付 /
 * 退款），`/api/memory/handoff/*` 有 4 个写接口（建交接包 / 接班 / 画像写回 /
 * 反馈提炼）。这些模块默认不鉴权时，任何能连上端口的机器都能退款、能改画像。
 *
 * 策略（不破坏现有本地开发）：
 *   1. 设了 `SF_API_TOKEN` → 必须带 `Authorization: Bearer <token>`，用
 *      timingSafeEqual 比较，长度不同直接拒（不做早退泄露）。
 *   2. 没设 `SF_API_TOKEN` → 只允许回环地址（127.0.0.1 / ::1 / ::ffff:127.0.0.1）。
 *      本机 curl、前端 dev server、测试都照常跑，不用配任何东西。
 *
 * 只挂在这两条新增功能线的 Router 上，不动其它既有路由（那是别人的代码）。
 *
 * 2026-11-08 隧道加固（cloudflared 公网映射）：经 Vite dev proxy / 隧道进来的
 * 请求，socket 端永远是 127.0.0.1，光看 req.ip 会把公网访客误判成本机——
 * 真实来源在转发头里。clientIp() 按 Cf-Connecting-Ip（cloudflared 写、不可伪造）
 * → X-Forwarded-For 第一个非回环 hop → X-Real-IP → socket 兜底的顺序解析；
 * 只要 Cf-Connecting-Ip 出现就认定远端（隧道入口必带，客户端伪造也会被
 * cloudflared 覆写）。另加 `loopbackAlways` 选项：密钥材料接口用「本机恒放行」
 * （即使配了 SF_API_TOKEN 也不挡本机 UI），远端仍走 token / 403。
 */

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** 回环判断：同时接受 IPv4 与 IPv6 映射写法，兼容 `::ffff:127.0.0.1`。 */
export function isLoopbackAddress(ip: string | undefined): boolean {
  if (!ip) return false;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return LOOPBACK.has(ip) || LOOPBACK.has(normalized);
}

/**
 * 解析真实客户端 IP（详见文件头 2026-11-08 注释）。
 * 全部转发头缺省或都是回环 → 本机 socket。
 */
function clientIp(req: Request): string | undefined {
  const xff = String(req.headers['x-forwarded-for'] ?? '');
  for (const hop of xff.split(',')) {
    const h = hop.trim();
    if (h && !isLoopbackAddress(h)) return h;
  }
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri.trim() && !isLoopbackAddress(xri.trim())) return xri.trim();
  return req.ip ?? req.socket?.remoteAddress;
}

/** 本机判定：无隧道入口头 且 客户端 IP 是回环。 */
function isLocalRequest(req: Request): boolean {
  // cloudflared 在入口处写入且会覆写客户端伪造值 —— 出现即公网来源。
  if (req.headers['cf-connecting-ip']) return false;
  return isLoopbackAddress(clientIp(req));
}

/** 定长比较，避免通过响应时间猜 token。 */
function tokenEquals(got: string, expected: string): boolean {
  const a = Buffer.from(got, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearer(req: Request): string {
  const header = String(req.headers.authorization ?? '');
  if (!header.toLowerCase().startsWith('bearer ')) return '';
  return header.slice(7).trim();
}

export interface ApiGuardOptions {
  /**
   * true → 本机回环请求恒放行（即使配置了 SF_API_TOKEN）。
   * 密钥材料接口（reveal / 写入 / 花费）用：本机 UI 不需要额外配 token，
   * 远端仍然走 SF_API_TOKEN 校验 / 403。
   */
  loopbackAlways?: boolean;
}

/**
 * 生成一个 guard 中间件。每次请求都读 env，方便测试与运行期改配置。
 */
export function apiGuard(options: ApiGuardOptions = {}): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const expected = (process.env.SF_API_TOKEN ?? '').trim();
    const local = isLocalRequest(req);

    if (options.loopbackAlways && local) {
      next();
      return;
    }

    if (expected) {
      const got = bearer(req);
      if (got && tokenEquals(got, expected)) {
        next();
        return;
      }
      res.status(got ? 403 : 401).json({
        error: { code: 'UNAUTHORIZED', message: got ? 'token 不匹配' : '缺少 Authorization: Bearer' },
      });
      return;
    }

    if (local) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        code: 'LOOPBACK_ONLY',
        message: '该接口默认只允许本机访问；远程调用请设置 SF_API_TOKEN 并带 Bearer 头',
      },
    });
  };
}
