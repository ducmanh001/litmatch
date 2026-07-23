import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { LoginPage } from './login-page';
import { apiClient } from '../api/client';
import { Providers } from '../../app/providers';

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
  afterEach(() => vi.restoreAllMocks());

  it('cung cấp đăng nhập Google dùng được cho profile không SMS', () => {
    renderLogin();

    expect(
      screen.getByRole('button', { name: 'Đăng nhập với Google' }),
    ).toBeVisible();
  });

  it('validate số điện thoại sai format bằng Zod trước khi gọi API', async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText('Số điện thoại'), 'abc');
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

    await userEvent.type(screen.getByLabelText('Số điện thoại'), '912345678');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByText('Mã OTP của bạn là 123456')).toBeVisible();
    expect(screen.getByLabelText('Mã OTP')).toHaveValue('123456');
  });
});
