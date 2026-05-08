import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NarrowNav } from './NarrowNav';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NarrowNav />
    </MemoryRouter>,
  );
}

describe('NarrowNav', () => {
  it('renders all navigation buttons including 开始', () => {
    renderAt('/inbox');
    expect(screen.getByLabelText('开始')).toBeInTheDocument();
    expect(screen.getByLabelText('消息')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('模板')).toBeInTheDocument();
    expect(screen.getByLabelText('运行')).toBeInTheDocument();
    expect(screen.getByLabelText('归档')).toBeInTheDocument();
  });

  it('marks /start as active when on start page', () => {
    renderAt('/start');
    expect(screen.getByLabelText('开始')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('消息')).not.toHaveAttribute('aria-current');
  });

  // Round-1 M1 + H1 regression: 点击"运行"后 location 必须停在 /runs
  // 而不是被 AppRoutes 的 `*` 通配符踢回 LandingPage
  it('navigates to /runs when 运行 is clicked (no redirect bounce)', async () => {
    function LocationProbe() {
      const location = useLocation();
      return <div data-testid="location-pathname">{location.pathname}</div>;
    }
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/inbox']}>
        <NarrowNav />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.click(screen.getByLabelText('运行'));
    expect(screen.getByTestId('location-pathname')).toHaveTextContent('/runs');
  });
});
