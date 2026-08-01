import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setLocale } from './locale-store';
import { t, useT } from './catalog';

describe('admin i18n catalog', () => {
  beforeEach(() => {
    document.cookie = 'litmatch-admin.locale=vi; Path=/';
    setLocale('vi');
  });

  it('translates typed interpolation values', () => {
    expect(t('auth.otpCode', { code: '123456' })).toBe(
      'Mã xác thực (OTP) của bạn là 123456',
    );
  });

  it('rerenders translations when the locale changes', () => {
    const { result } = renderHook(() => useT());
    expect(result.current('auth.signIn')).toBe('Đăng nhập');

    act(() => setLocale('en'));

    expect(result.current('auth.signIn')).toBe('Sign in');
    expect(document.documentElement.lang).toBe('en');
  });
});
