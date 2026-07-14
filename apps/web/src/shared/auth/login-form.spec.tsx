import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { LoginForm } from './login-form';
import { apiClient } from '../api/client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  afterEach(() => vi.restoreAllMocks());

  it('validate phone format bằng Zod trước khi gọi API', async () => {
    renderForm();

    await userEvent.type(screen.getByLabelText('Số điện thoại'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại không hợp lệ',
    );
  });

  it('ô SĐT tự động focus khi vào trang', () => {
    renderForm();
    expect(screen.getByLabelText('Số điện thoại')).toHaveFocus();
  });

  it('sang bước OTP — nút Gửi lại mã bị khoá đếm ngược, hết cooldown mới gửi lại được', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    const post = vi
      .spyOn(apiClient, 'POST')
      .mockResolvedValue({ data: {} } as never);

    renderForm();
    await user.type(screen.getByLabelText('Số điện thoại'), '912345678');
    await user.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    const resendButton = await screen.findByRole('button', {
      name: /Gửi lại mã \(30s\)/,
    });
    expect(resendButton).toBeDisabled();
    expect(post).toHaveBeenCalledWith('/api/v1/auth/otp/request', {
      body: { phone: '+84912345678' },
    });

    // Đếm ngược tick từng giây một, mỗi tick flush qua act() — chuỗi setTimeout đệ quy
    // (mỗi tick tự đặt lịch tick kế tiếp trong effect) cần React commit xong mới thấy tick sau.
    for (let i = 0; i < 30; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    const readyButton = await screen.findByRole('button', {
      name: 'Gửi lại mã',
    });
    expect(readyButton).toBeEnabled();

    await user.click(readyButton);
    expect(post).toHaveBeenCalledTimes(2);
    // Lần gửi lại phải dùng ĐÚNG phone đã chuẩn hoá trước đó, không normalize lại.
    expect(post).toHaveBeenLastCalledWith('/api/v1/auth/otp/request', {
      body: { phone: '+84912345678' },
    });

    vi.useRealTimers();
  });
});
