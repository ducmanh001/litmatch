import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { MatchActions } from './match-actions';
import { ConfirmSheet } from '../../../shared/ui/confirm-sheet';

const { routerReplace, searchParams } = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

function expectClass(element: HTMLElement, className: string) {
  expect(element.className.split(/\s+/)).toContain(className);
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => searchParams,
}));

describe('MatchActions', () => {
  afterEach(() => {
    routerReplace.mockClear();
    searchParams.delete('match');
    searchParams.delete('start');
  });

  it('chọn CTA, đổi URL sang trạng thái chọn và chỉ bắt đầu sau khi xác nhận trong sheet', async () => {
    render(
      <>
        <MatchActions />
        <ConfirmSheet />
      </>,
    );
    const user = userEvent.setup();

    expectClass(
      screen.getByRole('button', { name: 'Nhắn tin ẩn danh' }),
      'h-13',
    );
    expectClass(
      screen.getByRole('button', { name: 'Kết nối bằng voice' }),
      'h-13',
    );
    expectClass(
      screen.getByRole('button', { name: 'Nhắn tin ẩn danh' }),
      'min-h-13',
    );
    expectClass(
      screen.getByRole('button', { name: 'Kết nối bằng voice' }),
      'min-h-13',
    );

    await user.click(screen.getByRole('button', { name: 'Nhắn tin ẩn danh' }));

    expect(routerReplace).toHaveBeenCalledWith('/matching?match=soul');
    expect(await screen.findByText('Bắt đầu trò chuyện ẩn danh?')).toBeTruthy();
    expect(screen.getByText(/Radar chỉ minh hoạ quá trình quét/)).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Bắt đầu tìm Soul Match' }),
    );

    expect(routerReplace).toHaveBeenLastCalledWith(
      '/matching?match=soul&start=1',
    );
  });

  it('desktop giữ màu selected theo match trên URL và giữ hai CTA cùng kích thước', () => {
    searchParams.set('match', 'voice');

    render(<MatchActions />);

    const soulLink = screen.getByRole('link', { name: 'Nhắn tin ẩn danh' });
    const voiceLink = screen.getByRole('link', { name: 'Kết nối bằng voice' });

    expect(soulLink.getAttribute('aria-current')).toBeNull();
    expect(voiceLink.getAttribute('aria-current')).toBe('page');
    expectClass(soulLink, 'h-13');
    expectClass(voiceLink, 'h-13');
    expectClass(soulLink, 'min-h-13');
    expectClass(voiceLink, 'min-h-13');
  });
});
