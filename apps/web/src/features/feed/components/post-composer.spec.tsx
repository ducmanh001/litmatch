import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { PostComposer } from './post-composer';
import { apiClient } from '../../../shared/api/client';

function renderComposer() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PostComposer />
    </QueryClientProvider>,
  );
}

describe('PostComposer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('đăng bài với audience đã chọn — gửi đúng lên server', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { id: 'me' } },
    } as never);
    const postSpy = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { id: 'post-1' } },
    } as never);

    renderComposer();
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Nội dung bài viết' }),
      'Xin chào',
    );
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Ai có thể xem bài viết' }),
      'friends',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đăng' }));

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/feed/posts',
      expect.objectContaining({
        body: { content: 'Xin chào', imageUrl: undefined, audience: 'friends' },
      }),
    );
  });

  it('emoji picker chèn emoji vào nội dung', async () => {
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: { id: 'me' } },
    } as never);

    renderComposer();
    const textarea = screen.getByRole('textbox', {
      name: 'Nội dung bài viết',
    });
    await userEvent.type(textarea, 'Vui');
    await userEvent.click(screen.getByRole('button', { name: 'Chèn emoji' }));
    await userEvent.click(screen.getByRole('button', { name: 'Chèn 🔥' }));

    expect(textarea).toHaveValue('Vui🔥');
  });
});
