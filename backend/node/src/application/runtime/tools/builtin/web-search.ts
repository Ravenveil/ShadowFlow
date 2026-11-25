/**
 * web-search.ts — builtin `web_search` tool.
 *
 * Default mode ALLOW. The provider is selected via env vars at runtime — no
 * provider is bundled. Supported (in priority order):
 *
 *   1. `SERPAPI_API_KEY`   — uses serpapi.com /search.json (Google engine;
 *                            `source: 'wechat'` switches to the WeChat
 *                            公众号 engine).
 *   2. `TAVILY_API_KEY`    — uses api.tavily.com /search (`days` recency
 *                            filter; no WeChat engine — falls back to web).
 *   3. (none)              — returns a structured "no provider configured"
 *                            stub. Lets local-dev runs proceed without
 *                            burning an API key; the LLM gets a clear signal
 *                            it should not pretend it ran a real search.
 *
 * Output shape is provider-agnostic:
 *   { provider, query, results: [{ title, url, snippet }], count, note? }
 *
 * Optional filters (all backward compatible):
 *   - `recency`  day | week | month | year → SerpAPI tbs=qdr:d|w|m|y,
 *                Tavily days=1|7|30|365. WeChat engine ignores recency.
 *   - `source`   'web' (default) | 'wechat' (微信公众号). Tavily has no
 *                WeChat engine → results fall back to web with a note.
 *
 * 30s timeout. Network errors surface as `isError: true` rather than throw
 * so the conversation loop can continue.
 */

import type { ToolSpec } from '../../tool-spec';
import type { BuiltinToolExecutor, BuiltinToolContext } from './types';

export const webSearchTool: ToolSpec = {
  name: 'web_search',
  description:
    'Search the public web (or WeChat 公众号 articles via source: "wechat"). ' +
    'Returns up to 10 results with title, URL, and snippet. Optional recency ' +
    'filter: day / week / month / year. Provider is configured via ' +
    'SERPAPI_API_KEY or TAVILY_API_KEY env vars; without those configured ' +
    'returns a stub response.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string.' },
      limit: { type: 'number', description: 'Max results (1-10, default 5).' },
      recency: {
        type: 'string',
        enum: ['day', 'week', 'month', 'year'],
        description: 'Only return results from the last day/week/month/year.',
      },
      source: {
        type: 'string',
        enum: ['web', 'wechat'],
        description: "'web' = general web search (default); 'wechat' = WeChat 公众号 articles (SerpAPI only).",
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  source: 'base',
};

type Recency = 'day' | 'week' | 'month' | 'year';

interface WebSearchInput {
  query: string;
  limit?: number;
  recency?: Recency;
  source?: 'web' | 'wechat';
}

function isWebSearchInput(x: unknown): x is WebSearchInput {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { query: unknown }).query === 'string'
  );
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SERPAPI_TBS: Record<Recency, string> = {
  day: 'qdr:d',
  week: 'qdr:w',
  month: 'qdr:m',
  year: 'qdr:y',
};

const TAVILY_DAYS: Record<Recency, number> = {
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};

async function searchSerpAPI(
  apiKey: string,
  q: string,
  limit: number,
  recency: Recency | undefined,
  wechat: boolean,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const params = new URLSearchParams();
  params.set('engine', wechat ? 'wechat' : 'google');
  params.set('q', q);
  if (!wechat) params.set('num', String(limit));
  if (recency && !wechat) params.set('tbs', SERPAPI_TBS[recency]);
  params.set('api_key', apiKey);
  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const json = (await res.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>;
    // WeChat engine returns `wechat_results` (articles) with slightly
    // different field names; normalize below.
    wechat_results?: Array<{ title?: string; link?: string; snippet?: string; url?: string }>;
  };
  const items = (wechat ? json.wechat_results ?? [] : json.organic_results ?? []);
  return items.slice(0, limit).map((r) => ({
    title: r.title ?? '',
    url: r.link ?? (r as { url?: string }).url ?? '',
    snippet: r.snippet ?? '',
  }));
}

async function searchTavily(
  apiKey: string,
  q: string,
  limit: number,
  recency: Recency | undefined,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query: q,
      max_results: limit,
      ...(recency ? { days: TAVILY_DAYS[recency] } : {}),
    }),
    signal,
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const json = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  const items = json.results ?? [];
  return items.slice(0, limit).map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    snippet: r.content ?? '',
  }));
}

export const webSearchExecutor: BuiltinToolExecutor = async (
  input: unknown,
  ctx: BuiltinToolContext,
) => {
  if (!isWebSearchInput(input)) {
    return { output: { error: 'web_search: input must be { query: string, limit?, recency?, source? }' }, isError: true };
  }

  const limit = Math.max(1, Math.min(10, input.limit ?? 5));
  const env = ctx.env ?? (process.env as Record<string, string>);

  const serp = env.SERPAPI_API_KEY;
  const tavily = env.TAVILY_API_KEY;

  if (!serp && !tavily) {
    return {
      output: {
        provider: 'stub',
        query: input.query,
        results: [],
        count: 0,
        note: 'No web search provider configured (set SERPAPI_API_KEY or TAVILY_API_KEY). Tool returned a stub.',
      },
    };
  }

  // WeChat 公众号 search is a SerpAPI-only engine. With Tavily we fall back
  // to general web results and say so, rather than failing the turn.
  const wantWechat = input.source === 'wechat';
  const wechat = wantWechat && Boolean(serp);
  const notes: string[] = [];
  if (wantWechat && !serp) {
    notes.push('WeChat 公众号 search requires SERPAPI_API_KEY; fell back to general web results.');
  }

  const timeout = AbortSignal.timeout(30_000);
  const combined = AbortSignal.any([ctx.signal, timeout]);

  try {
    const provider = serp ? 'serpapi' : 'tavily';
    const results = serp
      ? await searchSerpAPI(serp, input.query, limit, input.recency, wechat, combined)
      : await searchTavily(tavily!, input.query, limit, input.recency, combined);
    return {
      output: {
        provider,
        query: input.query,
        source: wechat ? 'wechat' : 'web',
        ...(input.recency ? { recency: input.recency } : {}),
        count: results.length,
        results,
        ...(notes.length ? { note: notes.join(' ') } : {}),
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: { error: `web_search failed: ${msg}` }, isError: true };
  }
};
