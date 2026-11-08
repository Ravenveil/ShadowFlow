/**
 * openai-compat-vision.test.ts — 视觉注入 wire 翻译层（2026-11-08 修草拟"盲写"）。
 *
 * 覆盖：
 *   - buildUserTurnMessage（ApiClientCallable）：瞬态 user 消息合成（text+image 块）
 *   - toOpenAiMessages：image 块 → image_url data URI content part；
 *     无 image 块维持 string content（零回归）
 *   - deimageWireMessages：provider 拒图降级（image_url → 注记文本，归并 string）
 *
 * Run: npx vitest run src/__tests__/openai-compat-vision.test.ts
 */
import { describe, expect, it } from 'vitest';
import {
  deimageWireMessages,
  toOpenAiMessages,
  IMAGE_DROPPED_NOTE,
} from '../transport/api-clients/openai-compat-api-client';
import { buildUserTurnMessage } from '../transport/ApiClientCallable';
import type { ConversationMessage } from '../lib/conversation-types';

const IMG_B64 = Buffer.from('fake-png-bytes').toString('base64');

describe('buildUserTurnMessage — 瞬态 user 消息合成', () => {
  it('无 images → 单 text 块（旧行为零变化）', () => {
    expect(buildUserTurnMessage('hi')).toEqual({
      role: 'user',
      blocks: [{ kind: 'text', text: 'hi' }],
    });
  });

  it('images → text 在前、image 块附后；空 data 的图跳过', () => {
    const msg = buildUserTurnMessage('看图', [
      { media_type: 'image/png', data: IMG_B64 },
      { media_type: 'image/jpeg', data: '' }, // 空字节不进消息
    ]);
    expect(msg.blocks).toEqual([
      { kind: 'text', text: '看图' },
      { kind: 'image', media_type: 'image/png', data: IMG_B64 },
    ]);
  });
});

describe('toOpenAiMessages — image 块 → image_url content parts', () => {
  it('纯文本 user 消息维持 string content（零回归）', () => {
    const msgs: ConversationMessage[] = [
      { role: 'user', blocks: [{ kind: 'text', text: 'hello' }] },
    ];
    expect(toOpenAiMessages(msgs)).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('含 image 块 → [text part, image_url part(data URI…base64,)]', () => {
    const msgs: ConversationMessage[] = [buildUserTurnMessage('这是什么？', [
      { media_type: 'image/png', data: IMG_B64 },
    ])];
    const out = toOpenAiMessages(msgs);
    expect(out).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '这是什么？' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${IMG_B64}` } },
        ],
      },
    ]);
  });

  it('image media_type 缺省按 image/png；空 data 的 image 块不发', () => {
    const msgs: ConversationMessage[] = [
      {
        role: 'user',
        blocks: [
          { kind: 'text', text: 'x' },
          { kind: 'image', media_type: '', data: '' }, // 残缺块跳过
        ],
      },
    ];
    // 图全被过滤 → 退化 string content（不发残缺 data URI）
    expect(toOpenAiMessages(msgs)).toEqual([{ role: 'user', content: 'x' }]);
  });

  it('system/assistant/tool 消息翻译不受影响', () => {
    const msgs: ConversationMessage[] = [
      { role: 'system', blocks: [{ kind: 'text', text: 'sys' }] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'a' }] },
      {
        role: 'tool',
        blocks: [
          {
            kind: 'tool_result',
            tool_use_id: 't1',
            tool_name: 'x',
            output: 'ok',
            is_error: false,
          },
        ],
      },
    ];
    expect(toOpenAiMessages(msgs)).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'assistant', content: 'a' },
      { role: 'tool', tool_call_id: 't1', content: 'ok' },
    ]);
  });
});

describe('deimageWireMessages — provider 拒图降级（去图重试用）', () => {
  it('image_url part → 降级注记文本，user content 归并 string', () => {
    const wire = toOpenAiMessages([
      buildUserTurnMessage('看图', [{ media_type: 'image/png', data: IMG_B64 }]),
    ]);
    const out = deimageWireMessages(wire);
    expect(out).toEqual([
      { role: 'user', content: `看图\n${IMAGE_DROPPED_NOTE}` },
    ]);
    expect(out[0]!.content).toContain('无法读取图片内容');
    expect(out[0]!.content).not.toContain('base64');
  });

  it('无图消息原样返回（含 assistant/tool 不动）', () => {
    const wire = toOpenAiMessages([
      { role: 'user', blocks: [{ kind: 'text', text: 'plain' }] },
      { role: 'assistant', blocks: [{ kind: 'text', text: 'a' }] },
    ]);
    const out = deimageWireMessages(wire);
    expect(out).toEqual(wire);
  });
});
