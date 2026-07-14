import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { MemberList } from './member-list';
import { apiClient } from '../../../shared/api/client';

import type { PartyRoomMemberDto } from '../api';

const members: PartyRoomMemberDto[] = [
  { userId: 'host-1', role: 'host', joinedAt: new Date().toISOString() },
  { userId: 'speaker-1', role: 'speaker', joinedAt: new Date().toISOString() },
  { userId: 'aud-1', role: 'audience', joinedAt: new Date().toISOString() },
  { userId: 'aud-2', role: 'audience', joinedAt: new Date().toISOString() },
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

  it('hiển thị đếm khán giả, không liệt kê từng người', async () => {
    renderMemberList(false);
    expect(await screen.findByText('2 khán giả')).toBeVisible();
    expect(screen.queryByText('Nick-aud-1')).not.toBeInTheDocument();
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
    await screen.findByText('2 khán giả');
    expect(
      screen.queryByRole('button', { name: 'Mời lên nói' }),
    ).not.toBeInTheDocument();
  });
});
