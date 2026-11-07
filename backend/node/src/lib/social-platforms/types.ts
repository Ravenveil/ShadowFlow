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
  raw?: unknown;
}

export interface PlatformAdapter {
  platform: string;
  mode: AdapterMode;
  publish(postId: string, input: PublishInput, attempt: number): Promise<PublishReceipt>;
}
