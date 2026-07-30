import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';

import {
  ProductAnalyticsIdentity,
  ProductAnalyticsPreference,
} from './product-analytics-components';

const analyticsState = vi.hoisted(() => ({
  consent: null as 'accepted' | 'declined' | null,
  identify: vi.fn(),
  profile: undefined as { id: string; isGuest: boolean } | undefined,
  subscribers: new Set<() => void>(),
  setConsent: vi.fn(),
}));

vi.mock('../auth/use-current-user', () => ({
  useCurrentUser: () => ({ data: analyticsState.profile }),
}));

vi.mock('../i18n/messages', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('./product-analytics', () => ({
  getProductAnalyticsConsent: () => analyticsState.consent,
  identifyProductAnalyticsUser: analyticsState.identify,
  productAnalyticsConfig: {
    projectToken: 'phc_test',
    host: 'https://eu.i.posthog.com',
  },
  setProductAnalyticsConsent: (consent: 'accepted' | 'declined') => {
    analyticsState.setConsent(consent);
    analyticsState.consent = consent;
    analyticsState.subscribers.forEach((subscriber) => subscriber());
  },
  subscribeProductAnalyticsConsent: (subscriber: () => void) => {
    analyticsState.subscribers.add(subscriber);
    return () => analyticsState.subscribers.delete(subscriber);
  },
}));

describe('ProductAnalyticsPreference', () => {
  beforeEach(() => {
    analyticsState.consent = null;
    analyticsState.identify.mockClear();
    analyticsState.profile = undefined;
    analyticsState.subscribers.clear();
    analyticsState.setConsent.mockClear();
  });

  it('mặc định tắt, cho phép accept rồi decline lại', () => {
    render(<ProductAnalyticsPreference />);

    const preference = screen.getByRole('switch', {
      name: 'analytics.consentTitle',
    });
    expect(preference).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(preference);
    expect(analyticsState.setConsent).toHaveBeenLastCalledWith('accepted');
    expect(preference).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(preference);
    expect(analyticsState.setConsent).toHaveBeenLastCalledWith('declined');
    expect(preference).toHaveAttribute('aria-checked', 'false');
  });

  it('identify ngay khi user accept sau khi profile đã load', () => {
    analyticsState.profile = { id: 'user-1', isGuest: false };
    render(
      <>
        <ProductAnalyticsIdentity />
        <ProductAnalyticsPreference />
      </>,
    );

    expect(analyticsState.identify).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('switch', { name: 'analytics.consentTitle' }),
    );
    expect(analyticsState.identify).toHaveBeenCalledWith({
      id: 'user-1',
      isGuest: false,
    });
  });
});
