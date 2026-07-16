import { ApiError } from '@litmatch/api-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { IncomingInvites } from './incoming-invites';
import { apiClient } from '../../../shared/api/client';

import type { MatchInviteDto } from '../invite-api';

const { routerReplace } = vi.hoisted(() => ({ routerReplace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
}));

function inviteFixture(
  overrides: Partial<MatchInviteDto> = {},
): MatchInviteDto {
  return {
    id: 'invite-1',
    inviterUserId: 'user-a',
    inviteeUserId: 'user-b',
    matchType: 'voice',
    status: 'pending',
    expiresAt: new Date().toISOString(),
    sessionId: null,
    createdAt: new Date().toISOString(),
    inviterProfile: {
      id: 'user-a',
      nickname: 'Mai Anh',
      gender: 'female',
      avatarId: 'avatar-mai-anh',
    },
    ...overrides,
  };
}

function renderInvites() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <IncomingInvites />
    </QueryClientProvider>,
  );
}

describe('IncomingInvites', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    routerReplace.mockClear();
  });

  it('không có lời mời — hiển thị trạng thái rỗng rõ ràng', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    renderInvites();

    expect(await screen.findByText('Chưa có lời mời mới')).toBeVisible();
    expect(screen.getByText('Lời mời dành cho bạn')).toBeVisible();
  });

  it('có lời mời — chấp nhận thì confirm ticket rồi điều hướng vào đúng session', async () => {
    const invite = inviteFixture({ matchType: 'soul' });
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [invite], nextCursor: null } },
    } as never);
    vi.spyOn(apiClient, 'POST').mockImplementation(async (path: string) => {
      if (path === '/api/v1/matching/invites/{id}/accept') {
        return {
          data: {
            data: {
              invite: { ...invite, status: 'accepted' },
              sessionId: 'session-42',
              inviteeTicketId: 'ticket-42',
            },
          },
        } as never;
      }
      if (path === '/api/v1/matching/tickets/{id}/confirm') {
        return {
          data: { data: { id: 'ticket-42', status: 'confirmed' } },
        } as never;
      }
      throw new Error(`unexpected POST ${path}`);
    });

    renderInvites();
    expect(await screen.findByText('Mai Anh')).toBeVisible();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Chấp nhận' }));

    await vi.waitFor(() =>
      expect(routerReplace).toHaveBeenCalledWith('/matching/soul/session-42'),
    );
  });

  it('confirm ticket lỗi sau accept — không kẹt mãi ở "Đang vào…", cho bấm lại', async () => {
    const invite = inviteFixture({ matchType: 'voice' });
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [invite], nextCursor: null } },
    } as never);
    vi.spyOn(apiClient, 'POST').mockImplementation(async (path: string) => {
      if (path === '/api/v1/matching/invites/{id}/accept') {
        return {
          data: {
            data: {
              invite: { ...invite, status: 'accepted' },
              sessionId: 'session-42',
              inviteeTicketId: 'ticket-42',
            },
          },
        } as never;
      }
      if (path === '/api/v1/matching/tickets/{id}/confirm') {
        throw new ApiError(409, {
          code: 'MATCHING_TICKET_EXPIRED',
          message: 'Ticket đã hết hạn.',
          traceId: 't',
        });
      }
      throw new Error(`unexpected POST ${path}`);
    });

    renderInvites();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Chấp nhận' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ticket đã hết hạn.',
    );
    expect(
      await screen.findByRole('button', { name: 'Chấp nhận' }),
    ).toBeEnabled();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it('từ chối — gọi decline, không điều hướng', async () => {
    const invite = inviteFixture();
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [invite], nextCursor: null } },
    } as never);
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { ...invite, status: 'declined' } },
    } as never);

    renderInvites();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Từ chối' }));

    await vi.waitFor(() =>
      expect(post).toHaveBeenCalledWith(
        '/api/v1/matching/invites/{id}/decline',
        expect.objectContaining({ params: { path: { id: 'invite-1' } } }),
      ),
    );
    expect(routerReplace).not.toHaveBeenCalled();
  });
});
