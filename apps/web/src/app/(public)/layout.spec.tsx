import { act, render, screen } from '@testing-library/react';

import { tokenStore } from '../../shared/api/client';
import PublicLayout from './layout';

describe('PublicLayout header', () => {
  afterEach(() => act(() => tokenStore.setSession(null)));

  it('khách chưa đăng nhập thấy hai CTA auth trên PC và ẩn trên mobile', () => {
    render(
      <PublicLayout>
        <p>Nội dung công khai</p>
      </PublicLayout>,
    );

    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(
      screen.getByRole('link', { name: 'Đăng ký miễn phí' }),
    ).toHaveAttribute('href', '/login');
    expect(
      screen.getByRole('link', { name: 'Đăng ký miễn phí' }).parentElement,
    ).toHaveClass('hidden', 'md:flex');
    expect(
      screen.queryByRole('link', { name: 'Trải nghiệm ngay' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Tính năng' })).not.toHaveLength(
      0,
    );
    expect(
      screen.queryByRole('link', { name: 'Trang chủ' }),
    ).not.toBeInTheDocument();
  });

  it('đã đăng nhập thì bỏ CTA header nhưng vẫn giữ menu', () => {
    tokenStore.setSession({ accessToken: 'access', csrfToken: 'csrf' });

    render(
      <PublicLayout>
        <p>Nội dung công khai</p>
      </PublicLayout>,
    );

    expect(
      screen.queryByRole('link', { name: 'Trải nghiệm ngay' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Trang chủ' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Tính năng' })).not.toHaveLength(
      0,
    );
    expect(
      screen.getAllByRole('link', { name: 'Cách hoạt động' }),
    ).not.toHaveLength(0);
    expect(screen.getAllByRole('link', { name: 'Cộng đồng' })).not.toHaveLength(
      0,
    );
  });
});
