import { updateProfileSchema } from './update-profile-schema';

/** Bộ preference luôn có mặt trong form (default từ profile) — helper cho input hợp lệ. */
const PREFS = {
  interests: ['Du lịch'],
  seekingGender: 'any',
  seekingAgeMin: 22,
  seekingAgeMax: 30,
};

describe('updateProfileSchema', () => {
  it('chấp nhận input hợp lệ', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'female',
      birthDate: '2000-01-31',
      region: 'VN',
      ...PREFS,
    });
    expect(result.success).toBe(true);
  });

  it('chấp nhận birthDate/region rỗng (không đổi)', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'unknown',
      birthDate: '',
      region: '',
      ...PREFS,
    });
    expect(result.success).toBe(true);
  });

  it('từ chối quá 5 sở thích', () => {
    const result = updateProfileSchema.safeParse({
      nickname: 'Mưa Đêm',
      gender: 'unknown',
      ...PREFS,
      interests: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(result.success).toBe(false);
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
