import {
  localizeErrorMessage,
  resolveApiLocale,
} from './error-message.localizer';

describe('error-message.localizer', () => {
  it('ưu tiên locale được hỗ trợ đầu tiên và fallback vi cho header lạ', () => {
    expect(resolveApiLocale('en-US,en;q=0.9,vi;q=0.8')).toBe('en');
    expect(resolveApiLocale('fr-FR, vi;q=0.8')).toBe('vi');
    expect(resolveApiLocale(undefined)).toBe('vi');
  });

  it('giữ tiếng Việt mặc định và trả tiếng Anh theo error code', () => {
    expect(
      localizeErrorMessage('AUTH_OTP_INVALID', 'vi', 'Mã OTP không đúng'),
    ).toBe('Mã OTP không đúng');
    expect(
      localizeErrorMessage('AUTH_OTP_INVALID', 'en', 'Mã OTP không đúng'),
    ).toBe('The verification code is incorrect.');
  });

  it('không trả message nội bộ khi code chưa có catalog tiếng Anh', () => {
    expect(
      localizeErrorMessage('UNMAPPED_ERROR', 'en', 'Chi tiết nội bộ'),
    ).toBe('The request could not be completed.');
  });
});
