/**
 * Design System catalog API client (Story 15.5).
 *
 * Backed by `GET /api/design-systems`. When the backend is unreachable
 * (offline dev, server not started), callers fall back to `LOCAL_DS` so the
 * picker still renders.
 *
 * Note: `injection_prompt` is intentionally NOT exposed to the client — the
 * server splices it onto skill.system_prompt at run-time.
 */
import { getApiBase } from './_base';

export interface DesignSystemInfo {
  ds_id: string;
  name: string;
  description: string;
  compatible_skills: string[];
}

/**
 * Hardcoded fallback list. Mirrors the 4 built-in DS shipped by
 * server/src/design-systems.ts.
 */
export const LOCAL_DS: DesignSystemInfo[] = [
  {
    ds_id: 'none',
    name: '无约束',
    description: '让 Claude 自由发挥样式风格',
    compatible_skills: ['web-prototype', 'report', 'agent-team-blueprint'],
  },
  {
    ds_id: 'tailwind',
    name: 'Tailwind CSS',
    description: 'Utility-first CSS framework，CDN 版本可直接使用',
    compatible_skills: ['web-prototype'],
  },
  {
    ds_id: 'material',
    name: 'Material Design 3',
    description: 'Google Material Design 3，适合 SaaS 产品',
    compatible_skills: ['web-prototype'],
  },
  {
    ds_id: 'shadcn',
    name: 'shadcn/ui 风格',
    description: '现代简洁的深色 UI，Vercel/Linear 风格',
    compatible_skills: ['web-prototype'],
  },
];

export async function listDesignSystems(): Promise<DesignSystemInfo[]> {
  try {
    const res = await fetch(`${getApiBase()}/api/design-systems`);
    if (!res.ok) throw new Error(`listDesignSystems failed: ${res.status}`);
    const data = (await res.json()) as DesignSystemInfo[];
    if (!Array.isArray(data) || data.length === 0) return LOCAL_DS;
    return data;
  } catch {
    return LOCAL_DS;
  }
}
