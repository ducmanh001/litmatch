import { getUserDisplayName } from './user-display-name';

describe('getUserDisplayName', () => {
  it('ưu tiên nickname từ DTO user', () => {
    expect(getUserDisplayName({ nickname: '  Linh  ' }, 'vi')).toBe('Linh');
    expect(getUserDisplayName('Minh', 'en')).toBe('Minh');
  });

  it('chỉ dùng fallback khi user không có tên', () => {
    expect(getUserDisplayName(null, 'vi')).toBe('Người dùng');
    expect(getUserDisplayName({ nickname: ' ' }, 'en')).toBe('User');
  });
});
