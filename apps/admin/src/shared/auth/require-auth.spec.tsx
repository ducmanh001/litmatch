import { act, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { RequireAuth } from './require-auth';
import { tokenStore } from '../api/client';

function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (s: string) =>
    btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(payload))}.sig`;
}

function renderGuarded() {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <p>login-page</p> },
      {
        element: <RequireAuth />,
        children: [{ path: '/', element: <p>private-page</p> }],
      },
    ],
    { initialEntries: ['/'] },
  );
  return render(<RouterProvider router={router} />);
}

describe('RequireAuth', () => {
  afterEach(() => {
    act(() => tokenStore.setSession(null));
  });

  it('chưa đăng nhập → redirect về /login', () => {
    renderGuarded();
    expect(screen.getByText('login-page')).toBeDefined();
  });

  it('có session (token không giải mã được — vd token giả trong test) → render trang private (guard này KHÔNG phải chốt bảo mật)', () => {
    act(() => tokenStore.setSession({ accessToken: 'a', refreshToken: 'r' }));
    renderGuarded();
    expect(screen.getByText('private-page')).toBeDefined();
  });

  it('role admin/moderator → render trang private', () => {
    act(() =>
      tokenStore.setSession({
        accessToken: fakeJwt({ sub: 'u1', isGuest: false, role: 'admin' }),
        refreshToken: 'r',
      }),
    );
    renderGuarded();
    expect(screen.getByText('private-page')).toBeDefined();
  });

  it('role user (end-user thường) → chặn, hiện thông báo không có quyền', () => {
    act(() =>
      tokenStore.setSession({
        accessToken: fakeJwt({ sub: 'u1', isGuest: false, role: 'user' }),
        refreshToken: 'r',
      }),
    );
    renderGuarded();
    expect(screen.queryByText('private-page')).toBeNull();
    expect(
      screen.getByText('Tài khoản này không có quyền truy cập admin'),
    ).toBeDefined();
  });
});
