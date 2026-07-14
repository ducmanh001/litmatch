import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { LikeButton } from './like-button';
import { apiClient } from '../../../shared/api/client';

function renderButton() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LikeButton postId="post-1" fallbackLikeCount={5} />
    </QueryClientProvider>,
  );
}

describe('LikeButton', () => {
  afterEach(() => vi.restoreAllMocks());

  it('chưa thích — bấm gọi POST reactions rồi hiện trạng thái đã thích', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { liked: false, likeCount: 5 } },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { liked: true, likeCount: 6 } },
    } as never);

    renderButton();
    const button = await screen.findByRole('button', { name: /5/ });
    expect(button).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(button);

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/feed/posts/{postId}/reactions',
      { params: { path: { postId: 'post-1' } } },
    );
  });

  it('đã thích — bấm gọi DELETE reactions', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { liked: true, likeCount: 6 } },
    } as never);
    const deleteSpy = vi.spyOn(apiClient, 'DELETE').mockResolvedValue({
      data: { data: { liked: false, likeCount: 5 } },
    } as never);

    renderButton();
    const button = await screen.findByRole('button', { name: /6/ });
    expect(button).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(button);

    expect(deleteSpy).toHaveBeenCalledWith(
      '/api/v1/feed/posts/{postId}/reactions',
      { params: { path: { postId: 'post-1' } } },
    );
  });
});
