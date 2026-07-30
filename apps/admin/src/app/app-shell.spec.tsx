import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';

import { AppShell } from './app-shell';

vi.mock('../features/moderation/api', () => ({
  useReportsList: () => ({ data: undefined }),
}));

vi.mock('../shared/auth/use-role', () => ({
  useRole: () => 'admin',
}));

vi.mock('../shared/ui/theme-slider', () => ({
  ThemeSlider: () => null,
}));

vi.mock('../shared/ui/toast-stack', () => ({
  ToastStack: () => null,
}));

function renderAppShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('mở rộng menu từ icon rail và có thể thu gọn lại', () => {
    renderAppShell();

    const sidebar = screen.getByRole('complementary', {
      name: 'Menu đang thu gọn',
    });
    const sidebarSlot = sidebar.parentElement;

    expect(sidebar).toBeVisible();
    expect(sidebarSlot).toHaveClass('w-[74px]');

    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng menu' }));

    expect(
      screen.getByRole('complementary', { name: 'Menu đang mở rộng' }),
    ).toBeVisible();
    expect(sidebarSlot).toHaveClass('w-[74px]');
    expect(
      screen.getByRole('complementary', { name: 'Menu đang mở rộng' }),
    ).toHaveTextContent('Litmatch Admin');
    expect(
      screen
        .getByRole('complementary', { name: 'Menu đang mở rộng' })
        .querySelector('a[href="/"]'),
    ).toHaveClass('w-full');
    expect(
      screen.getByRole('button', { name: 'Thu gọn menu' }),
    ).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn menu' }));

    expect(
      screen.getByRole('complementary', { name: 'Menu đang thu gọn' }),
    ).toBeVisible();
    expect(
      screen.getByRole('complementary', { name: 'Menu đang thu gọn' }),
    ).not.toHaveTextContent('Litmatch Admin');
  });

  it('mở drawer mobile và command search có thể điều hướng bằng bàn phím', () => {
    renderAppShell();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu mobile' })).toHaveClass(
      'translate-x-0',
    );
    expect(
      within(screen.getByRole('dialog', { name: 'Menu mobile' })).getByRole(
        'button',
        { name: 'Đóng menu' },
      ),
    ).toHaveFocus();

    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    const search = screen.getByLabelText('Tìm trang quản trị');
    fireEvent.change(search, { target: { value: 'users' } });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    fireEvent.keyDown(search, { key: 'Enter' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Quản lý người dùng' }),
    ).toBeVisible();
  });

  it('drawer đóng bằng Escape và trả focus về nút mở', () => {
    renderAppShell();
    const trigger = screen.getByRole('button', { name: 'Mở menu' });
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'Menu mobile' }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
