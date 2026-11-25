/**
 * social-platforms/mock.ts — mock 发布适配器（2026-11-07）。
 *
 * 确定性回执：external_id = sha256(postId#attempt) 前 12 位，同一帖子同一次
 * 尝试永远同值——测试可断言、演示可复现，不发外网。
 */

import { createHash } from 'node:crypto';
import type { PlatformAdapter, PlatformSpec, PublishReceipt, RealPrerequisites } from './types';

/** 确定性 mock 外部 ID。 */
export function mockExternalId(platform: string, postId: string, attempt: number): string {
  const digest = createHash('sha256').update(`${postId}#${attempt}`).digest('hex');
  return `mock_${platform}_${digest.slice(0, 12)}`;
}

export function createMockAdapter(spec: PlatformSpec, realPrereq?: RealPrerequisites): PlatformAdapter {
  return {
    platform: spec.id,
    mode: 'mock',
    async publish(postId, input, attempt): Promise<PublishReceipt> {
      return {
        ok: true,
        external_id: mockExternalId(spec.id, postId, attempt),
        audit: 'passed',
        // C3/P0 建议（2026-11-07）：mock 回执带 real 前置条件元数据——消费方
        // （ops 智能体/看板）一眼可见这是模拟回执、切真实发布还缺哪些凭证/素材，
        // 对齐 #47 REAL_WIRING_PENDING / NEED_*_ASSET 口径，防 mock 被当真发布。
        ...(realPrereq ? { real_prerequisites: realPrereq } : {}),
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
