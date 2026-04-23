import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import QuadrantChart from './QuadrantChart';

describe('QuadrantChart', () => {
  it('renders SVG with accessible label', () => {
    render(<QuadrantChart />);
    expect(screen.getByRole('img', { name: /四维象限/ })).toBeInTheDocument();
  });

  it('highlights ShadowFlow in the chart', () => {
    const { container } = render(<QuadrantChart />);
    const texts = container.querySelectorAll('text');
    const sfLabel = Array.from(texts).find((t) => t.textContent === 'ShadowFlow');
    expect(sfLabel).toBeTruthy();
    expect(sfLabel?.getAttribute('fill')).toBe('#D8B4FE');
  });

  it('includes competitor labels', () => {
    const { container } = render(<QuadrantChart />);
    const allText = container.textContent ?? '';
    expect(allText).toContain('ChatGPT');
    expect(allText).toContain('LangGraph');
    expect(allText).toContain('AutoGen');
    expect(allText).toContain('N8N');
  });

  it('renders axis labels', () => {
    const { container } = render(<QuadrantChart />);
    const allText = container.textContent ?? '';
    expect(allText).toContain('单 Agent');
    expect(allText).toContain('多 Agent 协作');
    expect(allText).toContain('链上可传承');
    expect(allText).toContain('有状态本地');
  });
});
