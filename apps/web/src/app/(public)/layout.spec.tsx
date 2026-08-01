import { act, render, screen } from '@testing-library/react';

import { tokenStore } from '../../shared/api/client';
import PublicLayout from './layout';

describe('PublicLayout header', () => {
  afterEach(() => act(() => tokenStore.setSession(null)));

  it('khách chưa đăng nhập vẫn thấy sign in và chỉ hiện sign up từ breakpoint sm', () => {
    render(
      <PublicLayout>
        <p>Nội dung công khai</p>
      </PublicLayout>,
    );

    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Đăng ký miễn phí' })).toHaveClass(
      'hidden',
      'sm:inline-flex',
    );
    expect(
      screen.queryByRole('link', { name: 'Trang chủ' }),
    ).not.toBeInTheDocument();
  });

  it('đã đăng nhập thì thay toàn bộ CTA auth bằng link về Trang chủ', () => {
    tokenStore.setSession({ accessToken: 'access', csrfToken: 'csrf' });

    render(
      <PublicLayout>
        <p>Nội dung công khai</p>
      </PublicLayout>,
    );

    expect(
      screen.queryByRole('link', { name: 'Đăng nhập' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Đăng ký miễn phí' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Trang chủ' })).toHaveAttribute(
      'href',
      '/home',
    );
  });
});
