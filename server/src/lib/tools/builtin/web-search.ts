/**
 * web-search.ts — builtin `web_search` tool.
 *
 * Default mode ALLOW. The provider is selected via env vars at runtime — no
 * provider is bundled. Supported (in priority order):
 *
 *   1. `SERPAPI_API_KEY`   — uses serpapi.com /search.json
 *   2. `TAVILY_API_KEY`    — uses api.tavily.com /search
 *   3. (none)              — returns a structured "no provider configured"
 *                            stub. Lets local-dev runs proceed without
 *                            burning an API key; the LLM gets a clear signal
 *                            it should not pretend it ran a real search.
 *
 * Output shape is provider-agnostic:
 *   { provider, query, results: [{ title, url, snippet }], count }
 *
 * 30s timeout. Network errors surface as `isError: true` rather than throw
 * so the conversation loop can continue.
 */

import type { ToolSpec } from '../../tool-spec';
import type { BuiltinToolExecutor, BuiltinToolContext } from './types';

export const webSearchTool: ToolSpec = {
  name: 'web_search',
  description:
    'Search the public web. Returns up to 10 results with title, URL, and snippet. ' +
    'Provider is configured via SERPAPI_API_KEY or TAVILY_API_KEY env vars; ' +
    'without those configured returns a stub response.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query string.' },
      limit: { type: 'number', description: 'Max results (1-10, default 5).' },
    },
    required: ['query'],
    additionalProperties: false,
  },
  source: 'base',
};

interface WebSearchInput {
  query: string;
  limit?: number;
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

async function searchSerpAPI(apiKey: string, q: string, limit: number, signal: AbortSignal): Promise<SearchResult[]> {
  const url = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(q)}&num=${limit}&api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`SerpAPI ${res.status}`);
  const json = (await res.json()) as { organic_results?: Array<{ title?: string; link?: string; snippet?: string }> };
  const items = json.organic_results ?? [];
  return items.slice(0, limit).map((r) => ({
    title: r.title ?? '',
    url: r.link ?? '',
    snippet: r.snippet ?? '',
  }));
}

async function searchTavily(apiKey: string, q: string, limit: number, signal: AbortSignal): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query: q, max_results: limit }),
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
    return { output: { error: 'web_search: input must be { query: string, limit?: number }' }, isError: true };
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

  const timeout = AbortSignal.timeout(30_000);
  const combined = AbortSignal.any([ctx.signal, timeout]);

  try {
    const provider = serp ? 'serpapi' : 'tavily';
    const results = serp
      ? await searchSerpAPI(serp, input.query, limit, combined)
      : await searchTavily(tavily!, input.query, limit, combined);
    return {
      output: { provider, query: input.query, count: results.length, results },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { output: { error: `web_search failed: ${msg}` }, isError: true };
  }
};
