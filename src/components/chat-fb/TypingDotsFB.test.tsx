/**
 * TypingDotsFB.test.tsx — Stream E
 *
 * 仅断言挂载不抛 + agentName / meta 文案。
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { TypingDotsFB } from './TypingDotsFB';

describe('TypingDotsFB', () => {
  it('无 props 也能 mount', () => {
    render(<TypingDotsFB />);
    expect(screen.getByText(/Agent 正在思考/)).toBeTruthy();
  });

  it('agentName 渲染为 "{name} 正在思考"', () => {
    render(<TypingDotsFB agentName="审审" />);
    expect(screen.getByText(/审审 正在思考/)).toBeTruthy();
  });

  it('tokens / elapsedSec 渲染为 meta 文案', () => {
    render(<TypingDotsFB agentName="审审" tokens={480} elapsedSec={3.2} />);
    expect(screen.getByText(/~480 tokens · ~3\.2s/)).toBeTruthy();
  });

  it('role=status 用于无障碍 live region', () => {
    const { container } = render(<TypingDotsFB />);
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });
});
