import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { LoginForm } from './login-form';
import { getGoogleIdToken } from './social-sdk';
import { apiClient } from '../api/client';
import type { CapabilitiesDto } from '../capabilities/api';
import { ToastStack } from '../ui/toast-stack';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('./social-sdk', () => ({
  getGoogleIdToken: vi.fn().mockResolvedValue('google-id-token'),
  getAppleIdToken: vi.fn().mockResolvedValue('apple-id-token'),
  getFacebookAccessToken: vi.fn().mockResolvedValue('facebook-access-token'),
}));

function capabilityResponse(): CapabilitiesDto {
  const enabled = { status: 'enabled' as const, message: 'Sẵn sàng.' };
  return {
    auth: {
      phoneOtp: { ...enabled, clientId: null },
      google: { ...enabled, clientId: 'google-client' },
      apple: { ...enabled, clientId: 'apple-client' },
      facebook: { ...enabled, clientId: 'facebook-app' },
      guest: enabled,
    },
    topUp: {
      web: enabled,
      native: enabled,
      nativeApple: enabled,
      nativeGoogle: enabled,
    },
    video: { upload: enabled, transcode: enabled },
    notifications: { push: enabled },
  };
}

let runtimeCapabilities: CapabilitiesDto = capabilityResponse();

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginForm />
      <ToastStack />
    </QueryClientProvider>,
  );
}

describe('LoginForm', () => {
  beforeEach(() => {
    runtimeCapabilities = capabilityResponse();
    vi.spyOn(apiClient, 'GET').mockImplementation(async (path) => {
      if (path === '/api/v1/capabilities') {
        return { data: { data: runtimeCapabilities } } as never;
      }
      throw new Error(`GET không mock: ${path}`);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('validate phone format bằng Zod trước khi gọi API', async () => {
    renderForm();

    await userEvent.type(await screen.findByLabelText('Số điện thoại'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại không hợp lệ',
    );
  });

  it('ô SĐT tự động focus khi vào trang', async () => {
    renderForm();
    expect(await screen.findByLabelText('Số điện thoại')).toHaveFocus();
  });

  it('sang bước OTP — nút Gửi lại mã bị khoá đếm ngược, hết cooldown mới gửi lại được', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({
      advanceTimers: (ms) => vi.advanceTimersByTime(ms),
    });
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { code: '123456', ttlSeconds: 300 } },
    } as never);

    renderForm();
    await user.type(await screen.findByLabelText('Số điện thoại'), '912345678');
    await user.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    const resendButton = await screen.findByRole('button', {
      name: /Gửi lại mã \(30s\)/,
    });
    expect(resendButton).toBeDisabled();
    expect(await screen.findByText('Mã OTP của bạn là 123456')).toBeVisible();
    const otpDigitInputs = screen
      .getAllByRole('textbox')
      .filter((input) => input.getAttribute('inputmode') === 'numeric');
    expect(otpDigitInputs.map((input) => input.getAttribute('value'))).toEqual([
      ...'123456',
    ]);
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
    expect(await screen.findByText('Mã OTP của bạn là 123456')).toBeVisible();
    // Lần gửi lại phải dùng ĐÚNG phone đã chuẩn hoá trước đó, không normalize lại.
    expect(post).toHaveBeenLastCalledWith('/api/v1/auth/otp/request', {
      body: { phone: '+84912345678' },
    });

    vi.useRealTimers();
  });

  it('social login disabled → giữ nút, hiện message endpoint khi bấm và không gọi API', async () => {
    runtimeCapabilities.auth.google = {
      status: 'disabled',
      message: 'Đăng nhập Google chưa được cấu hình.',
      clientId: null,
    };
    const post = vi.spyOn(apiClient, 'POST');
    renderForm();

    const button = await screen.findByRole('button', {
      name: 'Đăng nhập với Google',
    });
    await userEvent.click(button);

    expect(
      await screen.findByText('Đăng nhập Google chưa được cấu hình.'),
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it('OTP disabled → giữ nút, bấm khi form trống vẫn hiện message endpoint', async () => {
    runtimeCapabilities.auth.phoneOtp = {
      status: 'disabled',
      message: 'Đăng nhập bằng số điện thoại chưa được bật.',
      clientId: null,
    };
    const post = vi.spyOn(apiClient, 'POST');
    renderForm();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Gửi mã OTP' }),
    );

    expect(
      await screen.findByText('Đăng nhập bằng số điện thoại chưa được bật.'),
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it('API cũ không trả code → hiển thị lỗi, không làm crash màn OTP', async () => {
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { ttlSeconds: 300 } },
    } as never);
    renderForm();

    await userEvent.type(
      await screen.findByLabelText('Số điện thoại'),
      '912345678',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'API chưa trả về mã OTP hợp lệ',
    );
  });

  it('Facebook maintenance → giữ nút và hiện message endpoint khi bấm', async () => {
    runtimeCapabilities.auth.facebook = {
      status: 'maintenance',
      message: 'Tính năng đang tạm bảo trì.',
      clientId: 'facebook-app',
    };
    const post = vi.spyOn(apiClient, 'POST');
    renderForm();

    const button = await screen.findByRole('button', {
      name: 'Đăng nhập với Facebook',
    });
    await userEvent.click(button);

    expect(
      await screen.findByText('Tính năng đang tạm bảo trì.'),
    ).toBeVisible();
    expect(post).not.toHaveBeenCalled();
  });

  it('capability endpoint chưa deploy → giữ login hiện tại bằng build-env fallback', async () => {
    vi.mocked(apiClient.GET).mockRejectedValue(
      new Error('capability endpoint chưa tồn tại'),
    );
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: undefined },
    } as never);
    renderForm();

    const googleButton = await screen.findByRole('button', {
      name: 'Đăng nhập với Google',
    });
    expect(screen.getByRole('button', { name: 'Gửi mã OTP' })).toBeVisible();
    await userEvent.click(googleButton);

    await waitFor(() =>
      expect(getGoogleIdToken).toHaveBeenCalledWith('test-google-client-id'),
    );
    expect(post).toHaveBeenCalledWith('/api/v1/auth/social', {
      body: { provider: 'google', idToken: 'google-id-token' },
    });
  });
});
