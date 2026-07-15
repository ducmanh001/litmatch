import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { PalmReadingView } from './palm-reading-view';

function renderView() {
  return render(<PalmReadingView />);
}

describe('PalmReadingView', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('bắt đầu ở trạng thái đang tìm — chưa hiện lá bài', () => {
    renderView();

    expect(
      screen.getByText('Đang tìm người để bói cùng...'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Huỷ tìm kiếm' })).toHaveAttribute(
      'href',
      '/home',
    );
    expect(
      screen.queryByRole('button', { name: /Lật bài/ }),
    ).not.toBeInTheDocument();
  });

  it('sau vài giây tự chuyển sang màn lật bài với đúng 2 lá', async () => {
    renderView();

    await vi.advanceTimersByTimeAsync(3000);

    expect(
      screen.getByRole('button', { name: 'Lật bài của bạn' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lật bài của người ấy' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem duyên số' })).toBeDisabled();
  });

  it('lật đủ 2 lá mới bật được nút xem duyên số, rồi hiện % hợp duyên', async () => {
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    renderView();
    await vi.advanceTimersByTimeAsync(3000);

    const cardMe = screen.getByRole('button', { name: 'Lật bài của bạn' });
    const cardThem = screen.getByRole('button', {
      name: 'Lật bài của người ấy',
    });
    const continueBtn = screen.getByRole('button', { name: 'Xem duyên số' });

    await user.click(cardMe);
    expect(continueBtn).toBeDisabled();

    await user.click(cardThem);
    expect(continueBtn).toBeEnabled();
    expect(screen.getByText('Cả hai đã lộ bài rồi!')).toBeInTheDocument();

    await user.click(continueBtn);

    expect(screen.getByText('Độ hợp duyên')).toBeInTheDocument();
    expect(screen.getByText(/^\d+%$/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Để lần khác/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Thích/ })).toBeInTheDocument();
  });

  async function goToFortuneState(
    user: ReturnType<typeof userEvent.setup>,
  ): Promise<void> {
    await vi.advanceTimersByTimeAsync(3000);
    await user.click(screen.getByRole('button', { name: 'Lật bài của bạn' }));
    await user.click(
      screen.getByRole('button', { name: 'Lật bài của người ấy' }),
    );
    await user.click(screen.getByRole('button', { name: 'Xem duyên số' }));
  }

  it('bấm "Thích" — hiện màn kết quả đã gửi lượt thích, có nút bói lại và về trang chủ', async () => {
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    renderView();
    await goToFortuneState(user);

    await user.click(screen.getByRole('button', { name: /Thích/ }));

    expect(screen.getByText('Đã gửi lượt thích!')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Bói với người khác' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute(
      'href',
      '/home',
    );
  });

  it('bấm "Để lần khác" — hiện màn đã bỏ qua', async () => {
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    renderView();
    await goToFortuneState(user);

    await user.click(screen.getByRole('button', { name: /Để lần khác/ }));

    expect(screen.getByText('Đã bỏ qua')).toBeInTheDocument();
  });

  it('bấm "Bói với người khác" ở màn kết quả — quay lại trạng thái đang tìm', async () => {
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    renderView();
    await goToFortuneState(user);
    await user.click(screen.getByRole('button', { name: /Thích/ }));

    await user.click(
      screen.getByRole('button', { name: 'Bói với người khác' }),
    );

    expect(
      screen.getByText('Đang tìm người để bói cùng...'),
    ).toBeInTheDocument();
  });
});
