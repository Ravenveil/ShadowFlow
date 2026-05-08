/**
 * PublishSuccessPanel.test.tsx — Story 8.6 AC8
 *
 * 覆盖：
 *  - 三个 CTA 按钮可点击（navigate to templates / editor / inbox）
 *  - "再次编辑"回调（onBackToEdit）触发
 *  - template_id 短 ID 显示
 *  - 复制按钮（navigator.clipboard mock）
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PublishSuccessPanel } from './PublishSuccessPanel';

// ─── mock useNavigate ───────────────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ─── mock navigator.clipboard ───────────────────────────────────────────────
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  writable: true,
  configurable: true,
});

// ─── helpers ────────────────────────────────────────────────────────────────
function renderPanel(overrides?: Partial<Parameters<typeof PublishSuccessPanel>[0]>) {
  const props = {
    templateId: 'bldr-abc12345',
    workflowId: 'wf-xyz67890',
    kitTags: ['research', 'report'],
    onBackToEdit: vi.fn(),
    ...overrides,
  };
  return { ...render(
    <MemoryRouter>
      <PublishSuccessPanel {...props} />
    </MemoryRouter>
  ), props };
}

// ─── tests ──────────────────────────────────────────────────────────────────

describe('PublishSuccessPanel', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockWriteText.mockReset().mockResolvedValue(undefined);
  });

  it('renders success panel with data-testid', () => {
    renderPanel();
    expect(screen.getByTestId('publish-success-panel')).toBeInTheDocument();
  });

  it('shows short template ID (first 8 chars)', () => {
    renderPanel({ templateId: 'bldr-abc12345' });
    // short ID is first 8 chars of templateId → 'bldr-abc'… wait, "bldr-abc12345" has 13 chars,
    // but we show first 8: "bldr-abc"
    expect(screen.getByTestId('template-id-short')).toHaveTextContent('bldr-abc');
  });

  it('CTA "查看模板" navigates to /templates', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('cta-view-templates'));
    expect(mockNavigate).toHaveBeenCalledWith('/templates');
  });

  it('CTA "在编辑器中打开" navigates to /editor?workflowId=...', () => {
    renderPanel({ workflowId: 'wf-xyz67890' });
    fireEvent.click(screen.getByTestId('cta-open-editor'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor?workflowId=wf-xyz67890');
  });

  it('CTA "发起群聊使用" navigates to /inbox', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('cta-open-inbox'));
    expect(mockNavigate).toHaveBeenCalledWith('/inbox');
  });

  it('"再次编辑" button triggers onBackToEdit callback', () => {
    const { props } = renderPanel();
    fireEvent.click(screen.getByTestId('back-to-edit-btn'));
    expect(props.onBackToEdit).toHaveBeenCalledTimes(1);
  });

  it('copy button calls navigator.clipboard.writeText with full templateId', async () => {
    renderPanel({ templateId: 'bldr-abc12345' });
    fireEvent.click(screen.getByTestId('copy-template-id-btn'));
    expect(mockWriteText).toHaveBeenCalledWith('bldr-abc12345');
  });

  it('renders kit tags when provided', () => {
    renderPanel({ kitTags: ['research', 'report'] });
    expect(screen.getByText('research')).toBeInTheDocument();
    expect(screen.getByText('report')).toBeInTheDocument();
  });

  it('renders without kit tags section when kitTags is empty', () => {
    renderPanel({ kitTags: [] });
    // should not crash
    expect(screen.getByTestId('publish-success-panel')).toBeInTheDocument();
  });
});
