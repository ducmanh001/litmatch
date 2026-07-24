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

describe('product analytics tracking', () => {
  beforeEach(() => {
    window.localStorage.clear();
    posthogMock.__loaded = false;
    vi.clearAllMocks();
  });

  it('không khởi tạo SDK khi chưa cấu hình hosted project', () => {
    expect(initializeProductAnalytics(null)).toBe(false);
    expect(posthogMock.init).not.toHaveBeenCalled();
  });

  it('khởi tạo tự động opt-in và cấu hình session recording', () => {
    expect(initializeProductAnalytics(config)).toBe(true);

    expect(posthogMock.init).toHaveBeenCalledWith(
      config.projectToken,
      expect.objectContaining({
        api_host: config.host,
        session_recording: {
          maskAllInputs: false, // Đúng theo cấu hình bạn muốn xem input
        },
      }),
    );
    expect(posthogMock.opt_in_capturing).toHaveBeenCalledOnce();
  });

  it('identify UUID + nickname + account type thành công', () => {
    const user = { id: 'user-1', nickname: 'Mai', isGuest: false };

    // Vì mặc định consent luôn là 'accepted', hàm identify sẽ chạy luôn mà không bị chặn
    identifyProductAnalyticsUser(user, config);

    expect(posthogMock.identify).toHaveBeenCalledWith('user-1', {
      nickname: 'Mai',
      account_type: 'registered',
    });
  });

  it('gọi setProductAnalyticsConsent luôn kích hoạt opt_in_capturing', () => {
    setProductAnalyticsConsent('accepted', config);
    expect(posthogMock.opt_in_capturing).toHaveBeenCalledOnce();
  });

  it('reset identity khi session kết thúc', () => {
    posthogMock.__loaded = true;
    resetProductAnalyticsUser(config);
    expect(posthogMock.reset).toHaveBeenCalledOnce();
  });
});
