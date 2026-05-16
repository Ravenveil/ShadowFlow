/**
 * CodeBlockToolbar.test.tsx
 *
 * Covers the four toolbar affordances plus the streaming-safe fence parser.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CodeBlockToolbar, parseCodeFences } from './CodeBlockToolbar';

describe('parseCodeFences', () => {
  it('returns a single text segment when there is no fence', () => {
    const out = parseCodeFences('hello world');
    expect(out).toEqual([{ kind: 'text', value: 'hello world' }]);
  });

  it('splits a triple-fence block with a language tag', () => {
    const out = parseCodeFences('intro\n```yaml\nfoo: 1\n```\nouter');
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ kind: 'text', value: 'intro\n' });
    expect(out[1]).toEqual({ kind: 'code', lang: 'yaml', value: 'foo: 1\n' });
    expect(out[2]).toEqual({ kind: 'text', value: '\nouter' });
  });

  it('handles an unterminated fence (SSE in-flight)', () => {
    const out = parseCodeFences('```ts\nconst x = 1');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({ kind: 'code', lang: 'ts', value: 'const x = 1' });
  });

  it('omits the lang when fence has no tag', () => {
    const out = parseCodeFences('```\nplain\n```');
    expect(out[0]).toEqual({ kind: 'code', lang: undefined, value: 'plain\n' });
  });
});

describe('<CodeBlockToolbar>', () => {
  beforeEach(() => {
    // Provide a writable clipboard mock — jsdom does not ship one.
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders the language label and code body', () => {
    render(<CodeBlockToolbar code="foo: 1" lang="yaml" />);
    expect(screen.getByText('yaml')).toBeInTheDocument();
    expect(screen.getByText('foo: 1')).toBeInTheDocument();
  });

  it('falls back to "text" when lang is omitted', () => {
    render(<CodeBlockToolbar code="hi" />);
    expect(screen.getByText('text')).toBeInTheDocument();
  });

  it('copies code to the clipboard and shows a Check briefly', async () => {
    vi.useFakeTimers();
    render(<CodeBlockToolbar code="hello" lang="ts" />);
    const copyBtn = screen.getByLabelText('Copy code');
    await act(async () => {
      fireEvent.click(copyBtn);
      // Flush the resolved clipboard promise.
      await Promise.resolve();
    });
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    // After click the label flips to "Copied".
    expect(screen.getByLabelText('Copied')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(screen.getByLabelText('Copy code')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('toggles line numbers on click', () => {
    render(<CodeBlockToolbar code={'a\nb\nc'} lang="ts" />);
    // No line numbers by default.
    expect(screen.queryByText('1')).toBeNull();
    fireEvent.click(screen.getByLabelText('Show line numbers'));
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('respects showLineNumbers prop on first render', () => {
    render(<CodeBlockToolbar code={'a\nb'} showLineNumbers />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('collapses and expands the body', () => {
    render(<CodeBlockToolbar code="big code" lang="ts" defaultCollapsed />);
    // In collapsed state the chevron label is "Expand".
    const expand = screen.getByLabelText('Expand');
    fireEvent.click(expand);
    expect(screen.getByLabelText('Collapse')).toBeInTheDocument();
  });
});
