import type { Template } from '../common/types/template';
import { getApiBase } from './_base';

const API_BASE_URL = getApiBase();

export interface TemplateListItem {
  template_id: string;
  name: string;
  user_role: string;
  default_ops_room_name: string;
  brief_board_alias: string;
  theme_color: string;
  agent_roster_count: number;
  group_roster_count: number;
  source: 'seed' | 'custom';
  /** Set to "builder" for templates generated via Builder (Story 8.6). */
  builder_origin: string;
  /** Workflow ID for /editor?workflowId=... (only set when builder_origin == "builder"). */
  workflow_id: string;
  description: string;
  /** Kit tags from Blueprint publish profile (Story 8.6 AC6). */
  kit_tags?: string[];
}

export interface ImportTemplatePayload {
  yaml_text: string;
  overrides?: {
    template_id?: string;
    user_role?: string;
    default_ops_room_name?: string;
  };
}

export interface PydanticValidationError {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export class TemplateApiError extends Error {
  constructor(
    public status: number,
    public detail: unknown,
  ) {
    super(`Template API error ${status}`);
  }
}

export class TemplateConflictError extends TemplateApiError {
  constructor(
    public conflictDetail: { detail: string; existing_source: 'seed' | 'custom' },
  ) {
    super(409, conflictDetail);
  }
}

export class TemplateValidationError extends TemplateApiError {
  constructor(public errors: PydanticValidationError[]) {
    super(422, errors);
  }
}

async function _handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;
  if (res.status === 409) {
    const body = await res.json();
    // FastAPI wraps HTTPException detail as {"detail": {...}} — unwrap one level
    throw new TemplateConflictError(body?.detail ?? body);
  }
  if (res.status === 422) {
    const body = await res.json();
    // FastAPI wraps HTTPException detail as {"detail": [...]} — unwrap one level
    const errors: PydanticValidationError[] = body?.detail ?? (Array.isArray(body) ? body : [body]);
    throw new TemplateValidationError(Array.isArray(errors) ? errors : [errors]);
  }
  if (res.status === 404) {
    throw new TemplateApiError(404, await res.text());
  }
  throw new TemplateApiError(res.status, await res.text());
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  const res = await fetch(`${API_BASE_URL}/templates`);
  return _handleResponse<TemplateListItem[]>(res);
}

export async function getTemplate(templateId: string): Promise<Template & { source: 'seed' | 'custom' }> {
  const res = await fetch(`${API_BASE_URL}/templates/${encodeURIComponent(templateId)}`);
  return _handleResponse<Template & { source: 'seed' | 'custom' }>(res);
}

export async function importCustomTemplate(
  payload: ImportTemplatePayload,
): Promise<Template & { source: 'seed' | 'custom' }> {
  const res = await fetch(`${API_BASE_URL}/templates/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return _handleResponse<Template & { source: 'seed' | 'custom' }>(res);
}
