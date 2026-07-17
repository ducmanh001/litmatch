import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { apiClient } from '../../../shared/api/client';
import { PermissionsPage } from './permissions-page';

const matrix = {
  permissions: [
    {
      permission: 'refund_transaction' as const,
      label: 'Hoàn tiền giao dịch',
      moderator: false,
      admin: true,
    },
    {
      permission: 'manage_permissions' as const,
      label: 'Phân quyền admin',
      moderator: false,
      admin: true,
    },
  ],
};
const staff = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    nickname: 'an.tran',
    role: 'moderator' as const,
  },
];

function renderPage() {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string) => {
    return {
      data: { data: path.endsWith('/staff') ? staff : matrix },
    } as never;
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PermissionsPage />
    </QueryClientProvider>,
  );
}

describe('PermissionsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hiện ma trận quyền + danh sách staff thật, không còn demo', async () => {
    renderPage();

    expect(await screen.findByText('an.tran')).toBeVisible();
    expect(screen.getByText('Hoàn tiền giao dịch')).toBeVisible();
    expect(screen.queryByText(/Minh hoạ/)).not.toBeInTheDocument();
  });

  it('tick quyền moderator gọi policy endpoint backend', async () => {
    const patch = vi.spyOn(apiClient, 'PATCH').mockResolvedValue({} as never);
    renderPage();

    const checkbox = await screen.findByLabelText(
      'Hoàn tiền giao dịch — moderator',
    );
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);

    expect(patch).toHaveBeenCalledWith(
      '/api/v1/admin/permissions/{role}/{permission}',
      {
        params: {
          path: { role: 'moderator', permission: 'refund_transaction' },
        },
        body: { enabled: true },
      },
    );
  });

  it('thu hồi staff gọi đổi role=user và refetch danh sách', async () => {
    const patch = vi.spyOn(apiClient, 'PATCH').mockResolvedValue({
      data: { data: { ...staff[0], role: 'user' } },
    } as never);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Thu hồi quyền' }),
    );

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/v1/admin/staff/{id}/role', {
        params: { path: { id: staff[0].id } },
        body: { role: 'user' },
      }),
    );
  });
});
