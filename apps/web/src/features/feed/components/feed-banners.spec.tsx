import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { FeedBanners } from './feed-banners';

describe('FeedBanners', () => {
  it('hiển thị carousel snap và cho điều hướng bằng nút tiếp theo', async () => {
    render(<FeedBanners />);

    const rail = screen.getByRole('list', { name: 'Lối tắt tính năng' });
    const scrollBy = vi.fn();
    Object.defineProperty(rail, 'scrollBy', {
      configurable: true,
      value: scrollBy,
    });

    expect(rail).toHaveClass('snap-mandatory');
    expect(screen.getByRole('link', { name: /Party Room/ })).toHaveAttribute(
      'href',
      '/party',
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Xem mục tiếp theo' }),
    );

    expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: 'smooth' });
  });
});
