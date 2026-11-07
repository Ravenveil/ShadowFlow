/**
 * social-platforms/mock.ts — mock 发布适配器（2026-11-07）。
 *
 * 确定性回执：external_id = sha256(postId#attempt) 前 12 位，同一帖子同一次
 * 尝试永远同值——测试可断言、演示可复现，不发外网。
 */

import { createHash } from 'node:crypto';
import type { PlatformAdapter, PlatformSpec, PublishReceipt } from './types';

/** 确定性 mock 外部 ID。 */
export function mockExternalId(platform: string, postId: string, attempt: number): string {
  const digest = createHash('sha256').update(`${postId}#${attempt}`).digest('hex');
  return `mock_${platform}_${digest.slice(0, 12)}`;
}

export function createMockAdapter(spec: PlatformSpec): PlatformAdapter {
  return {
    platform: spec.id,
    mode: 'mock',
    async publish(postId, input, attempt): Promise<PublishReceipt> {
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
