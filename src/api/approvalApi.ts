/** Approvals API client — Story 7.7 (AC3, AC5). */

import type { PendingApproval } from '../common/types/inbox';
import { getApiBase } from './_base';

export interface PendingApprovalsResponse {
  items: PendingApproval[];
}

export async function fetchPendingApprovals(groupId: string): Promise<PendingApproval[]> {
  const res = await fetch(`${getApiBase()}/api/groups/${encodeURIComponent(groupId)}/approvals/pending`);
  if (!res.ok) return [];
  const json: PendingApprovalsResponse = await res.json();
  return json.items ?? [];
}

export async function approveApproval(approvalId: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/approvals/${encodeURIComponent(approvalId)}/approve`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail));
  }
}

export async function rejectApproval(approvalId: string, reason: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/approvals/${encodeURIComponent(approvalId)}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail));
  }
}
