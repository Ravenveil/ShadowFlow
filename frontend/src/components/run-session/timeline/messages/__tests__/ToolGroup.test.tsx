/**
 * ToolGroup collapse behavior (2026-06-01).
 *
 * Tool-call cards must be COLLAPSED BY DEFAULT (a big Read/Bash result should
 * not flood the timeline) and expand on click — à la Claude Code. This locks:
 *   - default render: header visible, body (children) NOT in the DOM
 *   - click header: body appears
 *   - click again: body hidden
 *
 * fireEvent.click is flaky on nested buttons in jsdom (see
 * memory/reference_fireevent_click_flaky_jsdom) → use the native .click().
 */
import { describe, it, expect } from 'vitest';
import { render, act } from '@testing-library/react';
import { ToolGroup } from '../ToolGroup';

const BODY = 'TOOL_RESULT_BODY_MARKER';

describe('ToolGroup collapse', () => {
  it('is collapsed by default — header shown, body absent', () => {
    const { getByRole, queryByText } = render(
      <ToolGroup callCount={2}>
        <div>{BODY}</div>
      </ToolGroup>,
    );
    // Header is the toggle button, starts collapsed.
    const btn = getByRole('button');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(queryByText('工具调用')).toBeTruthy();
    // Body content is NOT rendered while collapsed.
    expect(queryByText(BODY)).toBeNull();
  });

  it('expands on click and collapses again', () => {
    const { getByRole, queryByText } = render(
      <ToolGroup callCount={1}>
        <div>{BODY}</div>
      </ToolGroup>,
    );
    const btn = getByRole('button') as HTMLButtonElement;

    // native click wrapped in act() so React flushes the state update before we query
    act(() => btn.click());
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(queryByText(BODY)).toBeTruthy();

    act(() => btn.click());
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(queryByText(BODY)).toBeNull();
  });

  it('honors defaultExpanded=true (body shown immediately)', () => {
    const { getByText } = render(
      <ToolGroup callCount={1} defaultExpanded>
        <div>{BODY}</div>
      </ToolGroup>,
    );
    expect(getByText(BODY)).toBeTruthy();
  });
});
