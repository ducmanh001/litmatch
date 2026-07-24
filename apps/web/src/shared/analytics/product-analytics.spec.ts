import { beforeEach, describe, expect, it, vi } from 'vitest';

const posthogMock = vi.hoisted(() => ({
  __loaded: false,
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('posthog-js', () => ({ default: posthogMock }));

import {
  captureProductWebVital,
  getProductAnalyticsConsent,
  identifyProductAnalyticsUser,
  initializeProductAnalytics,
  resetProductAnalyticsUser,
  setProductAnalyticsConsent,
} from './product-analytics';

const config = {
  projectToken: 'phc_test',
  host: 'https://eu.i.posthog.com',
};

describe('product analytics tracking', () => {
  beforeEach(() => {
    document.cookie =
      'litmatch-web.product-analytics-consent=; Path=/; Max-Age=0';
    posthogMock.__loaded = false;
    vi.clearAllMocks();
  });

  it('không khởi tạo SDK khi chưa cấu hình hosted project', () => {
    expect(initializeProductAnalytics(null)).toBe(false);
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('không khởi tạo SDK hoặc gửi request trước khi có consent', () => {
    expect(initializeProductAnalytics(config)).toBe(false);
    expect(posthogMock.init).not.toHaveBeenCalled();
    expect(posthogMock.opt_in_capturing).not.toHaveBeenCalled();
  });

  it('chỉ khởi tạo sau consent và che text/input của session replay', () => {
    setProductAnalyticsConsent('accepted', config);

    expect(getProductAnalyticsConsent()).toBe('accepted');
    expect(initializeProductAnalytics(config)).toBe(true);

    expect(posthogMock.init).toHaveBeenCalledWith(
      config.projectToken,
      expect.objectContaining({
        api_host: config.host,
        autocapture: false,
        capture_pageleave: false,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
        },
      }),
    );
    expect(posthogMock.opt_in_capturing).toHaveBeenCalled();
  });

  it('identify chỉ gửi UUID + account type sau consent, không gửi nickname', () => {
    const user = { id: 'user-1', isGuest: false };
    setProductAnalyticsConsent('accepted', config);
    posthogMock.__loaded = true;

    identifyProductAnalyticsUser(user, config);

    expect(posthogMock.identify).toHaveBeenCalledWith('user-1', {
      account_type: 'registered',
    });
  });

  it('persist decline và opt-out SDK nếu SDK đã được tải trước đó', () => {
    posthogMock.__loaded = true;
    setProductAnalyticsConsent('declined', config);

    expect(getProductAnalyticsConsent()).toBe('declined');
    expect(posthogMock.opt_out_capturing).toHaveBeenCalledOnce();
    expect(posthogMock.opt_in_capturing).not.toHaveBeenCalled();
  });

  it('chỉ capture Core Web Vitals thuộc mẫu 10% sau consent', () => {
    setProductAnalyticsConsent('accepted', config);
    posthogMock.__loaded = true;

    captureProductWebVital(
      {
        id: 'sampled-0',
        name: 'LCP',
        value: 1200,
        delta: 1200,
        rating: 'good',
      },
      config,
    );
    captureProductWebVital(
      { id: 'sampled-0', name: 'TTFB', value: 100, delta: 100 },
      config,
    );

    expect(posthogMock.capture).toHaveBeenCalledTimes(1);
    expect(posthogMock.capture).toHaveBeenCalledWith('web_vital', {
      metric_name: 'LCP',
      value: 1200,
      delta: 1200,
      rating: 'good',
    });
  });

  it('reset identity khi session kết thúc', () => {
    posthogMock.__loaded = true;
    resetProductAnalyticsUser(config);
    expect(posthogMock.reset).toHaveBeenCalledOnce();
  });
});
