import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';

import { LoginPage } from './login-page';
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
  it('validate số điện thoại sai format bằng Zod trước khi gọi API', async () => {
    renderLogin();
    await userEvent.type(screen.getByLabelText('Số điện thoại'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại không hợp lệ',
    );
  });
});
