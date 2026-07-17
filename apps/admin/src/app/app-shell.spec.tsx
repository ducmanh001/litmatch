import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Litmatch Admin')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toHaveClass(
      'w-full',
    );
    expect(
      screen.getByRole('button', { name: 'Thu gọn menu' }),
    ).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn menu' }));

    expect(
      screen.getByRole('complementary', { name: 'Menu đang thu gọn' }),
    ).toBeVisible();
    expect(screen.queryByText('Litmatch Admin')).not.toBeInTheDocument();
  });
});
