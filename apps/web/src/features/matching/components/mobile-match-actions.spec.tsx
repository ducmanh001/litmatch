import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { MobileMatchActions } from './mobile-match-actions';
import { ConfirmSheet } from '../../../shared/ui/confirm-sheet';

const { routerReplace, searchParams } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => searchParams,
}));

describe('MobileMatchActions', () => {
  afterEach(() => {
    routerReplace.mockClear();
    searchParams.delete('match');
    searchParams.delete('start');
  });

  it('chọn CTA, đổi URL sang trạng thái chọn và chỉ bắt đầu sau khi xác nhận trong sheet', async () => {
    render(
      <>
        <MobileMatchActions />
        <ConfirmSheet />
      </>,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Nhắn tin ẩn danh' }));

    expect(routerReplace).toHaveBeenCalledWith('/matching?match=soul');
    expect(
      await screen.findByText('Bắt đầu trò chuyện ẩn danh?'),
    ).toBeVisible();
    expect(screen.getByText(/Radar chỉ minh hoạ quá trình quét/)).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Bắt đầu tìm Soul Match' }),
    );

    expect(routerReplace).toHaveBeenLastCalledWith(
      '/matching?match=soul&start=1',
    );
  });
});
