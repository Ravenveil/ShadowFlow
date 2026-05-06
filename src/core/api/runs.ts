export interface GapResponsePayload {
  node_id: string;
  gap_choice: 'A' | 'B' | 'C';
  user_input?: string;
}

export async function postGapResponse(
  runId: string,
  payload: GapResponsePayload,
  baseUrl = '',
): Promise<{ accepted: boolean }> {
  const response = await fetch(`${baseUrl}/workflow/runs/${runId}/gap_response`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || 'Failed to submit gap response');
  }

  return await response.json() as { accepted: boolean };
}
