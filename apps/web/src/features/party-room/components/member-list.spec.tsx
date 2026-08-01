import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { MemberList } from './member-list';
import { apiClient } from '../../../shared/api/client';

import type { PartyRoomMemberDto } from '../api';

const members: PartyRoomMemberDto[] = [
  {
    userId: 'host-1',
    role: 'host',
    nickname: 'Nick-host-1',
    joinedAt: new Date().toISOString(),
    speakerInvitePending: false,
  },
  {
    userId: 'speaker-1',
    role: 'speaker',
    nickname: 'Nick-speaker-1',
    joinedAt: new Date().toISOString(),
    speakerInvitePending: false,
  },
  {
    userId: 'aud-1',
    role: 'audience',
    nickname: 'Nick-aud-1',
    joinedAt: new Date().toISOString(),
    speakerInvitePending: false,
  },
  {
    userId: 'aud-2',
    role: 'audience',
    nickname: 'Nick-aud-2',
    joinedAt: new Date().toISOString(),
    speakerInvitePending: false,
  },
];

function renderMemberList(isHost: boolean) {
  vi.spyOn(apiClient, 'GET').mockImplementation(async (path: string, opts) => {
    const id = (opts as { params: { path: { id: string } } }).params.path.id;
    return {
      data: {
        data: { id, nickname: `Nick-${id}`, gender: 'unknown', avatarId: 'a' },
      },
    } as never;
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemberList roomId="room-1" members={members} isHost={isHost} />
    </QueryClientProvider>,
  );
}

describe('MemberList', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mọi member đều thấy roster khán giả ở bên dưới', async () => {
    renderMemberList(false);
    expect(await screen.findByText('Khán giả (2)')).toBeVisible();
    expect(await screen.findByText('Nick-aud-1')).toBeVisible();
    expect(await screen.findByText('Nick-aud-2')).toBeVisible();
  });

  it('host thấy nút chuyển speaker xuống khán giả, non-host thì không', async () => {
    renderMemberList(true);
    expect(
      await screen.findByRole('button', { name: 'Chuyển xuống khán giả' }),
    ).toBeInTheDocument();
  });

  it('non-host không thấy nút chuyển role', async () => {
    renderMemberList(false);
    await screen.findByText(/Nick-speaker-1/);
    expect(
      screen.queryByRole('button', { name: 'Chuyển xuống khán giả' }),
    ).not.toBeInTheDocument();
  });

  it('host thấy từng khán giả kèm nút mời lên nói', async () => {
    renderMemberList(true);
    expect(await screen.findByText('Nick-aud-1')).toBeVisible();
    expect(screen.getByText('Nick-aud-2')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Mời lên nói' })).toHaveLength(
      2,
    );
  });

  it('non-host không thấy nút mời lên nói dù nhìn thấy khán giả', async () => {
    renderMemberList(false);
    await screen.findByText('Nick-aud-1');
    expect(
      screen.queryByRole('button', { name: 'Mời lên nói' }),
    ).not.toBeInTheDocument();
  });
});
