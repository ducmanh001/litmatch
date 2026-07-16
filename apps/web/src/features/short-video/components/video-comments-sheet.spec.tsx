import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { VideoCommentsSheet } from './video-comments-sheet';

describe('VideoCommentsSheet', () => {
  it('ẩn khỏi a11y khi đóng, nhận focus và hỗ trợ Escape khi mở', async () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <VideoCommentsSheet
        videoId={null}
        commentCount={0}
        open={false}
        onClose={onClose}
      />,
    );
    const sheet = container.querySelector('.video-comments-sheet');

    expect(sheet).toHaveAttribute('aria-hidden', 'true');
    expect(sheet).toHaveAttribute('inert');

    rerender(
      <VideoCommentsSheet
        videoId={null}
        commentCount={0}
        open
        onClose={onClose}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: '0 bình luận' }),
    ).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Đóng' })).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
