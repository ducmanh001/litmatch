import { describe, expect, it } from 'vitest';

import { translate } from './messages';

describe('web i18n catalog', () => {
  it('has a value for both supported locales', () => {
    expect(translate('vi', 'common.loading')).toBe('Đang tải…');
    expect(translate('en', 'common.loading')).toBe('Loading…');
  });

  it('supports typed runtime interpolation without translating user content', () => {
    expect(translate('vi', 'common.profileFor', { name: 'Linh' })).toBe(
      'Xem hồ sơ Linh',
    );
    expect(translate('en', 'auth.resendWithCooldown', { seconds: 12 })).toBe(
      'Resend code (12s)',
    );
  });
});
