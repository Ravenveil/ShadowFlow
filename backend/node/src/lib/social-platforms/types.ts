/**
 * social-platforms/types.ts — 平台适配器公共类型（2026-11-07）。
 */

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
  /** 图片/视频 URL 列表；视频平台取首个视频素材（见各 real 适配器注释）。 */
  media: string[];
}

/** mock 回执附带的 real 前置条件（C3/P0 建议项，2026-11-07）：
 *  消费方一眼可见「这是模拟回执、真实发布还缺什么」，防 mock 被当真实发布。 */
export interface RealPrerequisites {
  /** 真实发布所需凭证 env 名（对齐 realEnvContract）。 */
  envs: string[];
  /** 真实发布链一句话（对齐 realFlow）。 */
  flow: string;
  /** 真实发布还需的素材（cover_image/video 等，对齐 NEED_*_ASSET 口径）。 */
  assets: string[];
}

/** 发布回执：成功失败都是结构化对象，统一落 sp_publish_log。 */
export interface PublishReceipt {
  ok: boolean;
  /** 平台侧帖子 ID（mock 模式为确定性派生值）。 */
  external_id?: string;
  /** 失败时的结构化码：CREDENTIALS_MISSING / NEED_COVER_ASSET / NEED_VIDEO_ASSET /
   *  PLATFORM_LIMIT / REAL_WIRING_PENDING / PLATFORM_REJECTED / NETWORK_ERROR。 */
  code?: string;
  error?: string;
  /** mock 模式模拟的内容审核状态。 */
  audit?: string;
  /** 仅 mock 回执携带：切 real 前要补的凭证/素材/链路说明。 */
  real_prerequisites?: RealPrerequisites;
  raw?: unknown;
}

export interface PlatformAdapter {
  platform: string;
  mode: AdapterMode;
  publish(postId: string, input: PublishInput, attempt: number): Promise<PublishReceipt>;
}
