import { getGoogleIdToken } from '@litmatch/browser-auth';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { LoginPage } from './login-page';
import { apiClient } from '../api/client';
import type { CapabilitiesDto } from '../capabilities/api';
import { Providers } from '../../app/providers';

vi.mock('@litmatch/browser-auth', () => ({
  getGoogleIdToken: vi.fn().mockResolvedValue('google-id-token'),
}));

const enabled = { status: 'enabled' as const, message: 'Sẵn sàng.' };

function capabilityResponse(): CapabilitiesDto {
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

function renderLogin() {
  const router = createMemoryRouter(
    [{ path: '/login', element: <LoginPage /> }],
    {
      initialEntries: ['/login'],
    },
  );
  return render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    runtimeCapabilities = capabilityResponse();
    vi.spyOn(apiClient, 'GET').mockResolvedValue({
      data: { data: runtimeCapabilities },
    } as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it('cung cấp đăng nhập Google dùng được cho profile không SMS', async () => {
    renderLogin();

    expect(
      await screen.findByRole('button', { name: 'Đăng nhập với Google' }),
    ).toBeVisible();
  });

  it('validate số điện thoại sai format bằng Zod trước khi gọi API', async () => {
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Số điện thoại'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại không hợp lệ',
    );
  });

  it('nhận OTP từ API, hiển thị toast và tự điền mã', async () => {
    vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: { code: '123456', ttlSeconds: 300 } },
    } as never);
    renderLogin();

    await userEvent.type(
      await screen.findByLabelText('Số điện thoại'),
      '912345678',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(
      await screen.findByText('Mã xác thực (OTP) của bạn là 123456'),
    ).toBeVisible();
    expect(screen.getByLabelText('Mã OTP')).toHaveValue('123456');
  });

  it('Google disabled vẫn hiện nút, bấm hiện message endpoint và không gọi login API', async () => {
    runtimeCapabilities.auth.google = {
      status: 'disabled',
      message: 'Đăng nhập Google chưa được cấu hình.',
      clientId: null,
    };
    const post = vi.spyOn(apiClient, 'POST');
    renderLogin();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Đăng nhập với Google' }),
    );

    expect(
      (await screen.findAllByText('Đăng nhập Google chưa được cấu hình.'))
        .length,
    ).toBeGreaterThan(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('OTP disabled vẫn hiện nút và ưu tiên message endpoint trước validation', async () => {
    runtimeCapabilities.auth.phoneOtp = {
      status: 'disabled',
      message: 'Đăng nhập bằng số điện thoại chưa được bật.',
      clientId: null,
    };
    const post = vi.spyOn(apiClient, 'POST');
    renderLogin();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Gửi mã OTP' }),
    );

    expect(
      (
        await screen.findAllByText(
          'Đăng nhập bằng số điện thoại chưa được bật.',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(post).not.toHaveBeenCalled();
  });

  it('capability endpoint chưa deploy → giữ Google/OTP bằng build-env fallback', async () => {
    vi.mocked(apiClient.GET).mockRejectedValue(
      new Error('capability endpoint chưa tồn tại'),
    );
    const post = vi.spyOn(apiClient, 'POST').mockResolvedValue({
      data: { data: undefined },
    } as never);
    renderLogin();

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
