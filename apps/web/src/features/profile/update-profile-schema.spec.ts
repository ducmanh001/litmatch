import { updateProfileSchema } from './update-profile-schema';

describe('updateProfileSchema', () => {
  it('chấp nhận input hợp lệ', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'female',
      birthDate: '2000-01-31',
      region: 'VN',
    });
    expect(result.success).toBe(true);
  });

  it('chấp nhận birthDate/region rỗng (không đổi)', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'unknown',
      birthDate: '',
      region: '',
    });
    expect(result.success).toBe(true);
  });

  it('từ chối nickname quá ngắn', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'A',
      gender: 'unknown',
    });
    expect(result.success).toBe(false);
  });

  it('từ chối region không đúng định dạng ISO 2 ký tự', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'unknown',
      region: 'vietnam',
    });
    expect(result.success).toBe(false);
  });

  it('từ chối gender ngoài enum', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'robot',
    });
    expect(result.success).toBe(false);
  });
});
