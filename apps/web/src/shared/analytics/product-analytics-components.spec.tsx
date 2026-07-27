import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ProductAnalyticsPreference } from './product-analytics-components';

vi.mock('../auth/use-current-user', () => ({
  useCurrentUser: () => ({ data: undefined }),
}));

vi.mock('../i18n/messages', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('./product-analytics', () => ({
  identifyProductAnalyticsUser: vi.fn(),
  productAnalyticsConfig: {
    projectToken: 'phc_test',
    host: 'https://eu.i.posthog.com',
  },
}));

describe('ProductAnalyticsPreference', () => {
  it('hiển thị analytics đang bật và không có thao tác opt-in riêng', () => {
    render(<ProductAnalyticsPreference />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'analytics.consentTitle' }),
    ).toHaveAttribute('aria-checked', 'true');
  });
});
