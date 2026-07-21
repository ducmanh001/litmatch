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
  identifyProductAnalyticsUser,
  initializeProductAnalytics,
  resetProductAnalyticsUser,
  setProductAnalyticsConsent,
} from './product-analytics';

const config = {
  projectToken: 'phc_test',
  host: 'https://eu.i.posthog.com',
};

describe('product analytics privacy boundary', () => {
  beforeEach(() => {
    window.localStorage.clear();
    posthogMock.__loaded = false;
    vi.clearAllMocks();
  });

  it('không khởi tạo SDK khi chưa cấu hình hosted project', () => {
    expect(initializeProductAnalytics(null)).toBe(false);
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('khởi tạo opt-out mặc định và mask toàn bộ input/text replay', () => {
    expect(initializeProductAnalytics(config)).toBe(true);

    expect(posthogMock.init).toHaveBeenCalledWith(
      config.projectToken,
      expect.objectContaining({
        api_host: config.host,
        opt_out_capturing_by_default: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '*',
        },
      }),
    );
    expect(posthogMock.opt_out_capturing).toHaveBeenCalledOnce();
  });

  it('chỉ identify UUID + nickname + account type sau consent', () => {
    const user = { id: 'user-1', nickname: 'Mai', isGuest: false };
    identifyProductAnalyticsUser(user, config);
    expect(posthogMock.identify).not.toHaveBeenCalled();

    setProductAnalyticsConsent('accepted', config);
    identifyProductAnalyticsUser(user, config);

    expect(posthogMock.opt_in_capturing).toHaveBeenCalledOnce();
    expect(posthogMock.capture).toHaveBeenCalledWith('$pageview');
    expect(posthogMock.identify).toHaveBeenCalledWith('user-1', {
      nickname: 'Mai',
      account_type: 'registered',
    });
  });

  it('reset identity khi session kết thúc', () => {
    posthogMock.__loaded = true;
    resetProductAnalyticsUser(config);
    expect(posthogMock.reset).toHaveBeenCalledOnce();
  });
});
