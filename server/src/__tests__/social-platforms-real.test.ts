/**
 * social-platforms-real.test.ts — 六大平台 real 适配器契约测试（2026-11-07）。
 *
 * 全程 mock fetch（不打外网），按官方文档契约断言：
 *   - 请求链顺序与端点（token→素材→草稿→发布 …）
 *   - 请求体形态（form / json / multipart / 纯二进制）与关键字段
 *   - 平台错误 → 结构化 PLATFORM_REJECTED；缺凭证/缺素材 → CREDENTIALS_MISSING /
 *     NEED_COVER_ASSET / NEED_VIDEO_ASSET；网络失败 → NETWORK_ERROR；超长 → PLATFORM_LIMIT
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { getAdapter } from '../lib/social-platforms';

// ── fetch mock 基建 ───────────────────────────────────────────────────────────

interface FetchCall {
  url: string;
  init?: RequestInit;
}

const originalFetch = globalThis.fetch;
let calls: FetchCall[] = [];
let responder: (url: string) => Response;

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function binRes(bytes: number[], contentType: string): Response {
  return new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': contentType } });
}

function call(sub: string): FetchCall {
  const hit = calls.find((c) => c.url.includes(sub));
  if (!hit) throw new Error(`未找到请求: ${sub}（实际: ${calls.map((c) => c.url).join(' | ')}）`);
  return hit;
}

function formDataOf(c: FetchCall): FormData {
  return c.init?.body as unknown as FormData;
}

function paramsOf(c: FetchCall): URLSearchParams {
  return c.init?.body as unknown as URLSearchParams;
}

function jsonOf(c: FetchCall): Record<string, unknown> {
  return JSON.parse(String(c.init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  calls = [];
  responder = () => jsonRes({});
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return responder(url);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ── env 管理 ──────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  'SP_WECHAT_MP_APP_ID',
  'SP_WECHAT_MP_APP_SECRET',
  'SP_WECHAT_MP_ACCESS_TOKEN',
  'SP_WEIBO_ACCESS_TOKEN',
  'SP_XHS_ACCESS_TOKEN',
  'SP_DOUYIN_ACCESS_TOKEN',
  'SP_DOUYIN_OPEN_ID',
  'SP_KUAISHOU_ACCESS_TOKEN',
  'SP_KUAISHOU_APP_ID',
  'SP_SHIPINHAO_ACCESS_TOKEN',
];
const saved: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function clearEnv(): void {
  for (const k of ENV_KEYS) delete process.env[k];
}

// ── 微信公众号 ────────────────────────────────────────────────────────────────

describe('wechat_mp real 链（token→素材→草稿→freepublish）', () => {
  it('五步链全通：封面素材、正文插图、草稿正文 HTML、发布回执', async () => {
    clearEnv();
    process.env.SP_WECHAT_MP_APP_ID = 'wx-test-a';
    process.env.SP_WECHAT_MP_APP_SECRET = 'secret-a';
    responder = (url) => {
      if (url.includes('/cgi-bin/token')) return jsonRes({ access_token: 'tok-a', expires_in: 7200 });
      if (url.includes('/material/add_material')) return jsonRes({ media_id: 'thumb1', url: 'https://mmbiz/cover' });
      if (url.includes('/media/uploadimg')) return jsonRes({ url: 'https://mmbiz.qpic.cn/body1.png' });
      if (url.includes('/draft/add')) return jsonRes({ media_id: 'draft1' });
      if (url.includes('/freepublish/submit')) return jsonRes({ publish_id: 'pub42', msg_data_id: 'msg1' });
      return jsonRes({ errcode: -1, errmsg: 'unexpected ' + url });
    };

    const adapter = getAdapter('wechat_mp', 'real');
    const receipt = await adapter.publish('post-1', {
      title: '手作上新｜蓝染围巾',
      content: '第一行文案\n第二行文案',
      media: ['https://assets/cover.png', 'https://assets/body.png'],
    }, 1);

    expect(receipt.ok).toBe(true);
    expect(receipt.external_id).toBe('pub42');

    // token 换取带 appid/secret
    const token = call('/cgi-bin/token');
    expect(token.url).toContain('grant_type=client_credential');
    expect(token.url).toContain('appid=wx-test-a');
    expect(token.url).toContain('secret=secret-a');

    // 封面走永久素材 multipart
    const cover = call('/material/add_material');
    expect(cover.url).toContain('type=image');
    expect(formDataOf(cover).get('media')).toBeInstanceOf(Blob);

    // 正文插图走 uploadimg
    expect(formDataOf(call('/media/uploadimg')).get('media')).toBeInstanceOf(Blob);

    // 草稿：标题/摘要/正文 HTML（段落成 <p>、插图成 <img>）/thumb_media_id
    const draftBody = jsonOf(call('/draft/add'));
    const article = (draftBody.articles as Record<string, unknown>[])[0];
    expect(article.title).toBe('手作上新｜蓝染围巾');
    expect(article.thumb_media_id).toBe('thumb1');
    expect(String(article.content)).toContain('<p>第一行文案</p>');
    expect(String(article.content)).toContain('<img src="https://mmbiz.qpic.cn/body1.png"');

    // 发布用草稿 media_id
    expect(jsonOf(call('/freepublish/submit'))).toEqual({ media_id: 'draft1' });
  });

  it('token 有缓存：同 appid 第二次发布不再换 token', async () => {
    clearEnv();
    process.env.SP_WECHAT_MP_APP_ID = 'wx-test-b';
    process.env.SP_WECHAT_MP_APP_SECRET = 'secret-b';
    responder = (url) => {
      if (url.includes('/cgi-bin/token')) return jsonRes({ access_token: 'tok-b', expires_in: 7200 });
      if (url.includes('/material/add_material')) return jsonRes({ media_id: 'thumb2' });
      if (url.includes('/draft/add')) return jsonRes({ media_id: 'draft2' });
      return jsonRes({ publish_id: 'pub-b' });
    };
    const adapter = getAdapter('wechat_mp', 'real');
    const input = { title: 't', content: 'c', media: ['https://assets/c.png'] };
    await adapter.publish('p1', input, 1);
    await adapter.publish('p2', input, 1);
    const tokenCalls = calls.filter((c) => c.url.includes('/cgi-bin/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('缺封面 → NEED_COVER_ASSET；草稿 errcode → PLATFORM_REJECTED', async () => {
    clearEnv();
    process.env.SP_WECHAT_MP_APP_ID = 'wx-test-c';
    process.env.SP_WECHAT_MP_APP_SECRET = 'secret-c';
    const adapter = getAdapter('wechat_mp', 'real');

    const noCover = await adapter.publish('p', { title: 't', content: 'c', media: [] }, 1);
    expect(noCover.ok).toBe(false);
    expect(noCover.code).toBe('NEED_COVER_ASSET');

    responder = (url) => {
      if (url.includes('/cgi-bin/token')) return jsonRes({ access_token: 'tok-c', expires_in: 7200 });
      if (url.includes('/material/add_material')) return jsonRes({ media_id: 'thumb3' });
      return jsonRes({ errcode: 48001, errmsg: 'api unauthorized' });
    };
    const rejected = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/c.png'] }, 1);
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe('PLATFORM_REJECTED');
    expect(rejected.error).toContain('api unauthorized');
  });

  it('缺凭证 → CREDENTIALS_MISSING（不抛异常）', async () => {
    clearEnv();
    const adapter = getAdapter('wechat_mp', 'real');
    const receipt = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/c.png'] }, 1);
    expect(receipt.ok).toBe(false);
    expect(receipt.code).toBe('CREDENTIALS_MISSING');
  });
});

// ── 微博 ──────────────────────────────────────────────────────────────────────

describe('weibo real 链（update / upload）', () => {
  it('纯文本走 statuses/update.json，idstr 作 external_id', async () => {
    clearEnv();
    process.env.SP_WEIBO_ACCESS_TOKEN = 'wb-tok';
    responder = () => jsonRes({ idstr: 'w-1', created_at: 'now' });
    const adapter = getAdapter('weibo', 'real');
    const receipt = await adapter.publish('p', { title: '#手作好物#', content: '纯手工围巾上新', media: [] }, 1);
    expect(receipt.ok).toBe(true);
    expect(receipt.external_id).toBe('w-1');
    const c = call('api.weibo.com/2/statuses/update.json');
    expect(paramsOf(c).get('access_token')).toBe('wb-tok');
    expect(paramsOf(c).get('status')).toBe('#手作好物# 纯手工围巾上新');
  });

  it('带图走 upload.api.weibo.com multipart（pic 为文件）', async () => {
    clearEnv();
    process.env.SP_WEIBO_ACCESS_TOKEN = 'wb-tok';
    responder = () => jsonRes({ idstr: 'w-2' });
    const adapter = getAdapter('weibo', 'real');
    const receipt = await adapter.publish('p', { title: '', content: '带图微博', media: ['https://assets/pic.png'] }, 1);
    expect(receipt.ok).toBe(true);
    const c = call('upload.api.weibo.com/2/statuses/upload.json');
    const form = formDataOf(c);
    expect(form.get('status')).toBe('带图微博');
    expect(form.get('pic')).toBeInstanceOf(Blob);
  });

  it('超 140 字 → PLATFORM_LIMIT；平台 error_code → PLATFORM_REJECTED', async () => {
    clearEnv();
    process.env.SP_WEIBO_ACCESS_TOKEN = 'wb-tok';
    const adapter = getAdapter('weibo', 'real');

    const tooLong = await adapter.publish('p', { title: '', content: 'x'.repeat(141), media: [] }, 1);
    expect(tooLong.ok).toBe(false);
    expect(tooLong.code).toBe('PLATFORM_LIMIT');

    responder = () => jsonRes({ error_code: 20016, error: '发布内容过于频繁' });
    const rejected = await adapter.publish('p', { title: '', content: '短文本', media: [] }, 1);
    expect(rejected.ok).toBe(false);
    expect(rejected.code).toBe('PLATFORM_REJECTED');
    expect(rejected.error).toContain('发布内容过于频繁');
  });

  it('缺凭证 → CREDENTIALS_MISSING', async () => {
    clearEnv();
    const adapter = getAdapter('weibo', 'real');
    const receipt = await adapter.publish('p', { title: '', content: 'c', media: [] }, 1);
    expect(receipt.code).toBe('CREDENTIALS_MISSING');
  });
});

// ── 小红书 ────────────────────────────────────────────────────────────────────

describe('xiaohongshu real 链（upload/image → note/publish）', () => {
  it('图片上传拿 file_id 后发布，Bearer 鉴权，note_id 作 external_id', async () => {
    clearEnv();
    process.env.SP_XHS_ACCESS_TOKEN = 'xhs-tok';
    responder = (url) => {
      if (url.includes('/upload/image')) return jsonRes({ code: 0, data: { file_id: 'f-1' } });
      return jsonRes({ code: 0, data: { note_id: 'note-9' } });
    };
    const adapter = getAdapter('xiaohongshu', 'real');
    const receipt = await adapter.publish('p', { title: '手作控必收', content: '质感真的绝', media: ['https://assets/a.png'] }, 1);
    expect(receipt.ok).toBe(true);
    expect(receipt.external_id).toBe('note-9');

    const pub = call('/note/publish');
    expect((pub.init?.headers as Record<string, string>).authorization).toBe('Bearer xhs-tok');
    expect(jsonOf(pub)).toEqual({ title: '手作控必收', content: '质感真的绝', images: ['f-1'] });
    expect(formDataOf(call('/upload/image')).get('file')).toBeInstanceOf(Blob);
  });

  it('信封错误 → PLATFORM_REJECTED 带平台 message', async () => {
    clearEnv();
    process.env.SP_XHS_ACCESS_TOKEN = 'xhs-tok';
    responder = () => jsonRes({ code: 1001, message: '无笔记发布权限' });
    const adapter = getAdapter('xiaohongshu', 'real');
    const receipt = await adapter.publish('p', { title: 't', content: 'c', media: [] }, 1);
    expect(receipt.ok).toBe(false);
    expect(receipt.code).toBe('PLATFORM_REJECTED');
    expect(receipt.error).toContain('无笔记发布权限');
  });

  it('缺凭证 → CREDENTIALS_MISSING', async () => {
    clearEnv();
    const adapter = getAdapter('xiaohongshu', 'real');
    const receipt = await adapter.publish('p', { title: 't', content: 'c', media: [] }, 1);
    expect(receipt.code).toBe('CREDENTIALS_MISSING');
  });
});

// ── 抖音 ──────────────────────────────────────────────────────────────────────

describe('douyin real 链（upload_video → create_video）', () => {
  it('无视频素材 → NEED_VIDEO_ASSET', async () => {
    clearEnv();
    process.env.SP_DOUYIN_ACCESS_TOKEN = 'dy-tok';
    process.env.SP_DOUYIN_OPEN_ID = 'dy-open';
    const adapter = getAdapter('douyin', 'real');
    const receipt = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/a.png'] }, 1);
    expect(receipt.ok).toBe(false);
    expect(receipt.code).toBe('NEED_VIDEO_ASSET');
  });

  it('上传视频拿加密 video_id 后投稿，access-token 头 + open_id 查询串', async () => {
    clearEnv();
    process.env.SP_DOUYIN_ACCESS_TOKEN = 'dy-tok';
    process.env.SP_DOUYIN_OPEN_ID = 'dy-open';
    responder = (url) => {
      if (url.includes('/video/upload_video/')) {
        return jsonRes({ data: { error_code: 0, video: { video_id: 'vid-enc' } }, extra: { error_code: 0 } });
      }
      return jsonRes({ data: { error_code: 0, item_id: 'item-7' }, extra: { error_code: 0 } });
    };
    const adapter = getAdapter('douyin', 'real');
    const receipt = await adapter.publish('p', { title: '手作围巾', content: '纯手工', media: ['https://assets/v.mp4'] }, 1);
    expect(receipt.ok).toBe(true);
    expect(receipt.external_id).toBe('item-7');

    const up = call('/video/upload_video/');
    expect(up.url).toContain('open_id=dy-open');
    expect((up.init?.headers as Record<string, string>)['access-token']).toBe('dy-tok');
    expect(formDataOf(up).get('video')).toBeInstanceOf(Blob);

    const create = call('/video/create_video/');
    expect(jsonOf(create)).toEqual({ video_id: 'vid-enc', text: '手作围巾 纯手工' });
  });

  it('平台 error_code → PLATFORM_REJECTED', async () => {
    clearEnv();
    process.env.SP_DOUYIN_ACCESS_TOKEN = 'dy-tok';
    process.env.SP_DOUYIN_OPEN_ID = 'dy-open';
    responder = (url) =>
      url.includes('/video/upload_video/')
        ? jsonRes({ data: { error_code: 0, video: { video_id: 'vid-enc' } }, extra: { error_code: 0 } })
        : jsonRes({ data: { error_code: 21903, description: '视频审核不通过' }, extra: { error_code: 0 } });
    const adapter = getAdapter('douyin', 'real');
    const receipt = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/v.mp4'] }, 1);
    expect(receipt.ok).toBe(false);
    expect(receipt.code).toBe('PLATFORM_REJECTED');
    expect(receipt.error).toContain('视频审核不通过');
  });
});

// ── 快手 ──────────────────────────────────────────────────────────────────────

describe('kuaishou real 链（start_upload → 直传 → photo/publish）', () => {
  it('三步链全通：upload_token/endpoint、纯二进制直传、封面 multipart', async () => {
    clearEnv();
    process.env.SP_KUAISHOU_ACCESS_TOKEN = 'ks-tok';
    process.env.SP_KUAISHOU_APP_ID = 'ks-app';
    responder = (url) => {
      if (url.includes('/photo/start_upload')) return jsonRes({ result: 1, upload_token: 'ut-9', endpoint: 'up.test.gifshow.com' });
      if (url.includes('/api/upload')) return jsonRes({ result: 1 });
      return jsonRes({ result: 1, video_info: { photo_id: 'ph-3', pending: false } });
    };
    const adapter = getAdapter('kuaishou', 'real');
    const receipt = await adapter.publish('p', { title: '家人们', content: '纯手工', media: ['https://assets/v.mp4', 'https://assets/cover.jpg'] }, 1);
    expect(receipt.ok).toBe(true);
    expect(receipt.external_id).toBe('ph-3');

    const start = call('/photo/start_upload');
    expect(start.url).toContain('access_token=ks-tok');
    expect(start.url).toContain('app_id=ks-app');

    const up = call('up.test.gifshow.com/api/upload');
    expect(up.url).toContain('upload_token=ut-9');
    expect(up.init?.body).toBeInstanceOf(Uint8Array);

    const pub = call('/photo/publish');
    expect(pub.url).toContain('upload_token=ut-9');
    const form = formDataOf(pub);
    expect(form.get('caption')).toBe('家人们 纯手工');
    expect(form.get('cover')).toBeInstanceOf(Blob);
  });

  it('缺视频 → NEED_VIDEO_ASSET；缺封面 → NEED_COVER_ASSET；result!=1 → PLATFORM_REJECTED', async () => {
    clearEnv();
    process.env.SP_KUAISHOU_ACCESS_TOKEN = 'ks-tok';
    process.env.SP_KUAISHOU_APP_ID = 'ks-app';
    const adapter = getAdapter('kuaishou', 'real');

    const noVideo = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/cover.jpg'] }, 1);
    expect(noVideo.code).toBe('NEED_VIDEO_ASSET');

    const noCover = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/v.mp4'] }, 1);
    expect(noCover.code).toBe('NEED_COVER_ASSET');

    responder = () => jsonRes({ result: 0, error: '用户被封禁' });
    const rejected = await adapter.publish('p', { title: 't', content: 'c', media: ['https://assets/v.mp4', 'https://assets/c.jpg'] }, 1);
    expect(rejected.code).toBe('PLATFORM_REJECTED');
    expect(rejected.error).toContain('用户被封禁');
  });
});

// ── 视频号（能力边界）─────────────────────────────────────────────────────────

describe('shipinhao real（服务商权限集边界）', () => {
  it('缺凭证 → CREDENTIALS_MISSING；有凭证 → REAL_WIRING_PENDING（不接非官方通道）', async () => {
    clearEnv();
    const adapter = getAdapter('shipinhao', 'real');
    const missing = await adapter.publish('p', { title: 't', content: 'c', media: [] }, 1);
    expect(missing.code).toBe('CREDENTIALS_MISSING');

    process.env.SP_SHIPINHAO_ACCESS_TOKEN = 'sh-tok';
    const pending = await adapter.publish('p', { title: 't', content: 'c', media: [] }, 1);
    expect(pending.ok).toBe(false);
    expect(pending.code).toBe('REAL_WIRING_PENDING');
  });
});

// ── 网络失败 ──────────────────────────────────────────────────────────────────

describe('网络失败映射', () => {
  it('fetch 抛错 → NETWORK_ERROR 回执（不抛异常）', async () => {
    clearEnv();
    process.env.SP_WEIBO_ACCESS_TOKEN = 'wb-tok';
    responder = () => {
      throw new Error('ECONNRESET');
    };
    const adapter = getAdapter('weibo', 'real');
    const receipt = await adapter.publish('p', { title: '', content: 'c', media: [] }, 1);
    expect(receipt.ok).toBe(false);
    expect(receipt.code).toBe('NETWORK_ERROR');
  });
});
