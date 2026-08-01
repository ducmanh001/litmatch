import { act, render, screen } from '@testing-library/react';

import { tokenStore } from '../../shared/api/client';
import LandingPage from './page';

describe('LandingPage CTA', () => {
  afterEach(() => act(() => tokenStore.setSession(null)));

  it('khách được đưa tới màn đăng nhập từ CTA banner và cuối trang', () => {
    render(<LandingPage />);

    expect(
      screen.getByRole('link', { name: /Bắt đầu miễn phí/ }),
    ).toHaveAttribute('href', '/login');
    expect(
      screen.getByRole('link', { name: 'Trải nghiệm ngay' }),
    ).toHaveAttribute('href', '/login');
  });

  it('người đã đăng nhập được đưa thẳng về Home từ mọi CTA', () => {
    tokenStore.setSession({ accessToken: 'access', csrfToken: 'csrf' });

    render(<LandingPage />);

    const homeLinks = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === '/home');
    expect(homeLinks).toHaveLength(2);
    for (const link of homeLinks) {
      expect(link).toHaveTextContent('Trải nghiệm ngay');
      expect(link).toHaveAttribute('href', '/home');
    }
  });
});
