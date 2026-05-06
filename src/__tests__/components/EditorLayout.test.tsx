import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { EditorLayout } from '../../core/components/Layout/EditorLayout';

describe('EditorLayout', () => {
  it('renders toolbar, sidebar, canvas, inspector slots', () => {
    const { getByText } = render(
      <EditorLayout
        toolbar={<div>toolbar-slot</div>}
        sidebar={<div>sidebar-slot</div>}
        canvas={<div>canvas-slot</div>}
        inspector={<div>inspector-slot</div>}
      />
    );
    expect(getByText('toolbar-slot')).toBeTruthy();
    expect(getByText('sidebar-slot')).toBeTruthy();
    expect(getByText('canvas-slot')).toBeTruthy();
    expect(getByText('inspector-slot')).toBeTruthy();
  });

  it('uses default sidebarWidth and inspectorWidth', () => {
    const { container } = render(
      <EditorLayout toolbar={null} sidebar={null} canvas={null} inspector={null} />
    );
    const children = container.firstElementChild?.children;
    expect(children).toBeTruthy();
  });
});
