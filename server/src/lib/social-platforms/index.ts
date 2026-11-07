/**
 * social-platforms/index.ts — 社交平台发布适配器（2026-11-07）。
 *
 * 产业方向（手工艺人代运营）：对方只需上架商品，我们负责营销发布、联系快递
 * 寄出。本模块是「营销发布」的平台出口：统一 PlatformAdapter 接口 + 六大主流
 * 平台注册表（微信公众号 / 小红书 / 抖音 / 微博 / 微信视频号 / 快手）。
 *
 * mock / real 双模（按账号选）：
 *   - mock（默认）：确定性回执（external_id = sha256(post#attempt) 前 12 位），
 *     不发外网、可测试可演示 —— 无凭证环境的「直接发布」走这条。
 *   - real：按平台读 env 凭证（见 REAL_ENV）。缺凭证返回结构化
 *     CREDENTIALS_MISSING 回执（不是异常、不 5xx）；微博已接真实
 *     statuses/update 单发链路作参照，其余平台留接线位（多步授权 + 内容审核，
 *     拿到企业凭证后逐个补，接口不变）。
 *
 * 纯函数模块：不 import storage、无 DB 依赖，方便单测与后续替换真实现。
 */

import { createHash } from 'node:crypto';

export type AdapterMode = 'mock' | 'real';

/** 平台规格：文案长度 / 图片数上限，创建帖子时按此校验。 */
export interface PlatformSpec {
  id: string;
  name: string;
  /** 0 = 平台无独立标题（如微博正文即全部）。 */
  title_max: number;
  content_max: number;
  max_media: number;
}

export interface PublishInput {
  title: string;
  content: string;
  media: string[];
}

/** 发布回执：成功失败都是结构化对象，统一落 sp_publish_log。 */
export interface PublishReceipt {
  ok: boolean;
  /** 平台侧帖子 ID（mock 模式为确定性派生值）。 */
  external_id?: string;
  /** 失败时的结构化码：CREDENTIALS_MISSING / REAL_WIRING_PENDING /
   *  PLATFORM_REJECTED / NETWORK_ERROR。 */
  code?: string;
  error?: string;
  /** mock 模式模拟的内容审核状态。 */
  audit?: string;
  raw?: unknown;
}

export interface PlatformAdapter {
  platform: string;
  mode: AdapterMode;
  publish(postId: string, input: PublishInput, attempt: number): Promise<PublishReceipt>;
}

export const PLATFORMS: PlatformSpec[] = [
  { id: 'wechat_mp', name: '微信公众号', title_max: 64, content_max: 20000, max_media: 9 },
  { id: 'xiaohongshu', name: '小红书', title_max: 20, content_max: 1000, max_media: 9 },
  { id: 'douyin', name: '抖音', title_max: 55, content_max: 1000, max_media: 1 },
  { id: 'weibo', name: '微博', title_max: 0, content_max: 2000, max_media: 9 },
  { id: 'shipinhao', name: '微信视频号', title_max: 16, content_max: 1000, max_media: 9 },
  { id: 'kuaishou', name: '快手', title_max: 0, content_max: 500, max_media: 9 },
];

export function findPlatform(id: string): PlatformSpec | undefined {
  return PLATFORMS.find((p) => p.id === id);
}

/** real 模式各平台的凭证契约（env 变量名 + 说明），也用于 /platforms 端点自描述。 */
const REAL_ENV: Record<string, { env: string; note: string }> = {
  wechat_mp: { env: 'SP_WECHAT_MP_ACCESS_TOKEN', note: '公众号 access_token（草稿 + 发布接口）' },
  xiaohongshu: { env: 'SP_XHS_ACCESS_TOKEN', note: '小红书开放平台 token' },
  douyin: { env: 'SP_DOUYIN_ACCESS_TOKEN', note: '抖音开放平台 token' },
  weibo: { env: 'SP_WEIBO_ACCESS_TOKEN', note: '微博 OAuth2 access_token' },
  shipinhao: { env: 'SP_SHIPINHAO_ACCESS_TOKEN', note: '视频号 access_token' },
  kuaishou: { env: 'SP_KUAISHOU_ACCESS_TOKEN', note: '快手开放平台 token' },
};

export function realEnvContract(platform: string): { env: string; note: string } | undefined {
  return REAL_ENV[platform];
}

/** 确定性 mock 外部 ID：同一帖子同一次尝试永远同值，测试可断言、演示可复现。 */
function mockExternalId(platform: string, postId: string, attempt: number): string {
  const digest = createHash('sha256').update(`${postId}#${attempt}`).digest('hex');
  return `mock_${platform}_${digest.slice(0, 12)}`;
}

function mockAdapter(spec: PlatformSpec): PlatformAdapter {
  return {
    platform: spec.id,
    mode: 'mock',
    async publish(postId, input, attempt) {
      return {
        ok: true,
        external_id: mockExternalId(spec.id, postId, attempt),
        audit: 'passed',
        raw: {
          mode: 'mock',
          platform: spec.id,
          title_chars: input.title.length,
          content_chars: input.content.length,
          media_count: input.media.length,
          attempt,
        },
      };
    },
  };
}

function realAdapter(spec: PlatformSpec): PlatformAdapter {
  const contract = REAL_ENV[spec.id];
  return {
    platform: spec.id,
    mode: 'real',
    async publish(_postId, input, _attempt) {
      const token = (process.env[contract?.env ?? ''] ?? '').trim();
      if (!token) {
        return {
          ok: false,
          code: 'CREDENTIALS_MISSING',
          error: `缺少环境变量 ${contract?.env ?? '(未定义)'}（${contract?.note ?? ''}），无法真实发布`,
        };
      }
      // 微博：单发 statuses/update 是一步式公开接口，作为 real 接线参照实现。
      // 其余平台是多步授权（草稿/素材/审核），凭证到位后按同一接口补，不改调用方。
      if (spec.id === 'weibo') {
        const status = [input.title, input.content].filter(Boolean).join(' ').slice(0, spec.content_max);
        try {
          const res = await fetch('https://api.weibo.com/2/statuses/update.json', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ access_token: token, status }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            idstr?: string;
            error_code?: number | string;
            error?: string;
          };
          if (!res.ok || data.error_code) {
            return {
              ok: false,
              code: 'PLATFORM_REJECTED',
              error: data.error ?? `HTTP ${res.status}`,
              raw: data,
            };
          }
          return { ok: true, external_id: String(data.idstr ?? ''), raw: data };
        } catch (e) {
          return { ok: false, code: 'NETWORK_ERROR', error: (e as Error).message };
        }
      }
      return {
        ok: false,
        code: 'REAL_WIRING_PENDING',
        error: `${spec.name} 真实发布链路待接线（多步授权 + 内容审核），适配器接口已就位`,
      };
    },
  };
}

export function getAdapter(platform: string, mode: AdapterMode): PlatformAdapter {
  const spec = findPlatform(platform);
  if (!spec) {
    throw new Error(`未知平台: ${platform}`);
  }
  return mode === 'real' ? realAdapter(spec) : mockAdapter(spec);
}
