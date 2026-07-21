import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { vi } from 'vitest';

import { feedKeys, useDeletePost, useFeed } from './api';
import { apiClient } from '../../shared/api/client';

import type { ReactNode } from 'react';

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe('feed api hooks', () => {
  afterEach(() => vi.restoreAllMocks());

  it('giới hạn mỗi trang; tác giả đã được nhúng trong response', async () => {
    const getSpy = vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { items: [], nextCursor: null } },
    } as never);
    const { wrapper } = createHarness();

    const { result } = renderHook(() => useFeed(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getSpy).toHaveBeenCalledWith('/api/v1/feed/posts', {
      params: { query: { limit: 10, cursor: undefined } },
    });
  });

  it('xoá cache chi tiết, bình luận và reaction sau khi xoá bài', async () => {
    vi.spyOn(apiClient, 'DELETE').mockResolvedValue({} as never);
    const { queryClient, wrapper } = createHarness();
    queryClient.setQueryData(feedKeys.list, { pages: [] });
    queryClient.setQueryData(feedKeys.detail('post-1'), { id: 'post-1' });
    queryClient.setQueryData(feedKeys.comments('post-1'), { pages: [] });
    queryClient.setQueryData(feedKeys.reaction('post-1'), { liked: true });

    const { result } = renderHook(() => useDeletePost(), { wrapper });
    await act(async () => result.current.mutateAsync('post-1'));

    expect(queryClient.getQueryData(feedKeys.detail('post-1'))).toBeUndefined();
    expect(
      queryClient.getQueryData(feedKeys.comments('post-1')),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(feedKeys.reaction('post-1')),
    ).toBeUndefined();
    expect(queryClient.getQueryState(feedKeys.list)?.isInvalidated).toBe(true);
  });
});
