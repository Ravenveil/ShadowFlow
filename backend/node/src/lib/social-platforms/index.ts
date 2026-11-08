/**
 * social-platforms/index.ts — 社交平台发布适配器公共门面（2026-11-07）。
 *
 * 产业方向（手工艺人代运营）：对方只需上架商品，我们负责营销发布、联系快递
 * 寄出。本模块是「营销发布」的平台出口：统一 PlatformAdapter 接口 + 六大主流
 * 平台注册表（微信公众号 / 小红书 / 抖音 / 微博 / 微信视频号 / 快手）。
 *
 * mock / real 双模（按账号选）：
 *   - mock（默认）：确定性回执（mock.ts），不发外网、可测试可演示。
 *   - real：按平台真实开放接口接线（real-*.ts，契约经官方文档核实）：
 *     · 微信公众号：token→素材→draft/add→freepublish/submit（异步）
 *     · 微博：statuses/update / statuses/upload（图，≤140 字）
 *     · 小红书：OAuth2→upload/image→note/publish（需「笔记发布」权限）
 *     · 抖音：upload_video→create_video（需视频素材）
 *     · 快手：start_upload→二进制直传→photo/publish（需视频+封面）
 *     · 视频号：仅服务商权限集代发布，未开通前返回 REAL_WIRING_PENDING
 *     缺凭证一律结构化 CREDENTIALS_MISSING 回执（不 5xx）。
 *
 * 纯函数模块：不 import storage、无 DB 依赖（real 适配器仅出网 fetch），
 * 方便单测（mock fetch）与后续替换。
 */

export type { AdapterMode, PlatformAdapter, PlatformSpec, PublishInput, PublishReceipt } from './types';
import type { AdapterMode, PlatformAdapter, PlatformSpec } from './types';
import { createMockAdapter } from './mock';
import { createWechatMpAdapter } from './real-wechat-mp';
import { createWeiboAdapter } from './real-weibo';
import { createXiaohongshuAdapter } from './real-xiaohongshu';
import { createDouyinAdapter } from './real-douyin';
import { createKuaishouAdapter } from './real-kuaishou';
import { createShipinhaoAdapter } from './real-shipinhao';

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

export interface RealEnvContract {
  envs: string[];
  note: string;
}

/** real 模式各平台的凭证契约（env 变量名 + 说明），/platforms 端点自描述用。 */
const REAL_ENV: Record<string, RealEnvContract> = {
  wechat_mp: {
    envs: ['SP_WECHAT_MP_APP_ID', 'SP_WECHAT_MP_APP_SECRET'],
    note: '公众号 appid/secret 换 access_token（可选 SP_WECHAT_MP_ACCESS_TOKEN 覆盖，服务商代发布用）',
  },
  xiaohongshu: {
    envs: ['SP_XHS_CLIENT_ID', 'SP_XHS_CLIENT_SECRET', 'SP_XHS_ACCESS_TOKEN', 'SP_XHS_REFRESH_TOKEN'],
    note:
      '小红书开放平台 OAuth2（企业资质 + 「笔记发布」权限）：access_token 约 2h 有效，' +
      '经 /api/social-publish/xhs/* 浏览器授权→code 换 token→refresh 续期并回写 .env（发布前自动续期）',
  },
  douyin: {
    envs: ['SP_DOUYIN_ACCESS_TOKEN', 'SP_DOUYIN_OPEN_ID'],
    note: '抖音开放平台用户授权 token + open_id（能力实验室「代替用户发布内容到抖音」）',
  },
  weibo: {
    envs: ['SP_WEIBO_ACCESS_TOKEN'],
    note: '微博 OAuth2 用户授权 access_token（单条 ≤140 字）',
  },
  shipinhao: {
    envs: ['SP_SHIPINHAO_ACCESS_TOKEN'],
    note: '微信第三方平台 authorizer_access_token（服务商权限集代发布，开通前仅登记不直发）',
  },
  kuaishou: {
    envs: ['SP_KUAISHOU_ACCESS_TOKEN', 'SP_KUAISHOU_APP_ID'],
    note: '快手开放平台用户授权 token + app_id（scope user_video_publish）',
  },
};

/** real 发布链一句话描述，/platforms 端点自描述用。 */
const REAL_FLOW: Record<string, string> = {
  wechat_mp: 'token→素材上传→draft/add→freepublish/submit（异步出结果）',
  xiaohongshu: 'OAuth2→upload/image→note/publish',
  douyin: 'upload_video→create_video（需视频素材）',
  weibo: 'statuses/update / statuses/upload（图，≤140 字）',
  shipinhao: '服务商权限集代发布（未开通前 REAL_WIRING_PENDING）',
  kuaishou: 'start_upload→二进制直传→photo/publish（需视频+封面）',
};

export function realEnvContract(platform: string): RealEnvContract | undefined {
  return REAL_ENV[platform];
}

export function realFlow(platform: string): string {
  return REAL_FLOW[platform] ?? '';
}

const REAL_FACTORIES: Record<string, (spec: PlatformSpec) => PlatformAdapter> = {
  wechat_mp: createWechatMpAdapter,
  xiaohongshu: createXiaohongshuAdapter,
  douyin: createDouyinAdapter,
  weibo: createWeiboAdapter,
  shipinhao: createShipinhaoAdapter,
  kuaishou: createKuaishouAdapter,
};

export function getAdapter(platform: string, mode: AdapterMode): PlatformAdapter {
  const spec = findPlatform(platform);
  if (!spec) {
    throw new Error(`未知平台: ${platform}`);
  }
  if (mode !== 'real') return createMockAdapter(spec);
  const factory = REAL_FACTORIES[platform];
  return factory ? factory(spec) : createMockAdapter(spec);
}
