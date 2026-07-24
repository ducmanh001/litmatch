import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { ProductAnalyticsPreference } from './product-analytics-components';

const analyticsMocks = vi.hoisted(() => ({
  setConsent: vi.fn(),
}));

vi.mock('../auth/use-current-user', () => ({
  useCurrentUser: () => ({ data: undefined }),
}));

vi.mock('../i18n/messages', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('./product-analytics', () => ({
  getProductAnalyticsConsent: () => null,
  identifyProductAnalyticsUser: vi.fn(),
  productAnalyticsConfig: {
    projectToken: 'phc_test',
    host: 'https://eu.i.posthog.com',
  },
  setProductAnalyticsConsent: analyticsMocks.setConsent,
  subscribeProductAnalyticsConsent: () => () => undefined,
}));

describe('ProductAnalyticsPreference', () => {
  it('không tự bật, không hiện dialog và chỉ opt-in khi người dùng bật trong cài đặt', async () => {
    render(<ProductAnalyticsPreference />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(analyticsMocks.setConsent).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole('switch', {
        name: 'analytics.consentTitle',
      }),
    );

    expect(analyticsMocks.setConsent).toHaveBeenCalledOnce();
    expect(analyticsMocks.setConsent).toHaveBeenCalledWith('accepted');
  });
});
