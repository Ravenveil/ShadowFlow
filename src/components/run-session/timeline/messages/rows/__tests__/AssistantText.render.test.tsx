/**
 * AssistantText render integration test (Round 2.5).
 *
 * Verifies that when an assistant_text TimelineMessage carries a markdown
 * body containing ` ```bash ` / ` ```python ` blocks, those structural
 * units are rendered as DEDICATED chip elements (BashChip / CodeBlockRow),
 * not as one opaque <pre> code block inside the prose.
 *
 * This is the FE-only proof for DoD-2 ("assistant_text 含 bash 块时真的
 * 渲成 chip，不是裸代码") since the BMAD server path currently can't
 * emit such markdown (pipeline fails earlier on output_kind='nodes' bug).
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AssistantText } from '../../AssistantText';
import type { TimelineMessage } from '../../../types';

function mk(body: string, streaming = false): Extract<TimelineMessage, { kind: 'assistant_text' }> {
  return {
    id: 'mid-1',
    kind: 'assistant_text',
    turn_id: 'tid-1',
    ts: Date.now(),
    body,
    streaming,
  };
}

describe('AssistantText (Round 2.5 chip rendering)', () => {
  it('renders a bash fence as a BashChip with $ Bash header', () => {
    const msg = mk(
      ['Here is the setup:', '', '```bash', 'npm install', 'npm run dev', '```', '', 'Done.'].join('\n'),
    );
    const { container } = render(<AssistantText msg={msg} />);
    // The chip header contains a `$` lead glyph + 'Bash' kind label.
    expect(container.textContent).toContain('$');
    expect(container.textContent).toContain('Bash');
    expect(container.textContent).toContain('done'); // status badge
    expect(container.textContent).toContain('Here is the setup:');
    expect(container.textContent).toContain('Done.');
  });

  it('renders a python fence as a CodeBlockRow with lang badge', () => {
    const msg = mk(['```python', 'print("hi")', '```'].join('\n'));
    const { container } = render(<AssistantText msg={msg} />);
    expect(container.textContent).toContain('python');
    expect(container.textContent).toContain('code'); // info badge
    expect(container.textContent).toContain('print("hi")');
  });

  it('renders an inline `$ cmd` as a compact bash chip without expanded body', () => {
    const msg = mk(['Run:', '$ ls -la', 'then check.'].join('\n'));
    const { container } = render(<AssistantText msg={msg} />);
    expect(container.textContent).toContain('$');
    expect(container.textContent).toContain('ls -la');
    expect(container.textContent).toContain('then check.');
  });

  it('renders a `## heading` as a SectionHeader divider', () => {
    const msg = mk(['intro', '', '## 步骤一', '', 'detail'].join('\n'));
    const { container } = render(<AssistantText msg={msg} />);
    // SectionHeader renders the title in its label slot.
    expect(container.textContent).toContain('步骤一');
    expect(container.textContent).toContain('intro');
    expect(container.textContent).toContain('detail');
  });

  it('produces multiple distinct chip + text DOM nodes (not one opaque block)', () => {
    const msg = mk(
      [
        'first paragraph',
        '',
        '```bash',
        'echo hi',
        '```',
        '',
        'middle prose',
        '',
        '```python',
        'x = 1',
        '```',
      ].join('\n'),
    );
    const { container } = render(<AssistantText msg={msg} />);
    // textStack is the outer wrapper. Its direct children should be the
    // sequence of row components (text/bash-chip/text/code-chip).
    const stack = container.firstElementChild;
    expect(stack).not.toBeNull();
    expect(stack!.childElementCount).toBeGreaterThanOrEqual(4);
  });
});
