import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { LoginForm } from './login-form';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

describe('LoginForm', () => {
  it('validate phone format bằng Zod trước khi gọi API', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <LoginForm />
      </QueryClientProvider>,
    );

    await userEvent.type(screen.getByLabelText('Số điện thoại'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Số điện thoại không hợp lệ',
    );
  });
});
