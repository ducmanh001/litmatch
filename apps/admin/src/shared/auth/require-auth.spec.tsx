import { act, render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { RequireAuth } from './require-auth';
import { tokenStore } from '../api/client';

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

  it('có session → render trang private', () => {
    act(() => tokenStore.setSession({ accessToken: 'a', refreshToken: 'r' }));
    renderGuarded();
    expect(screen.getByText('private-page')).toBeDefined();
  });
});
