import type { Template } from '../common/types/template';

const API_BASE_URL = 'http://localhost:8000';

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
    throw new TemplateConflictError(body);
  }
  if (res.status === 422) {
    const body = await res.json();
    throw new TemplateValidationError(Array.isArray(body) ? body : [body]);
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
