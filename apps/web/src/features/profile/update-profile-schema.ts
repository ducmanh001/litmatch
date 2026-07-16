import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (docs/06, UpdateProfileDto). */
export const updateProfileSchema = z.object({
  nickname: z.string().trim().min(2, 'Tối thiểu 2 ký tự').max(50),
  gender: z.enum(['unknown', 'male', 'female', 'other']),
  birthDate: z
    .string()
    .refine(
      (value) => value === '' || !Number.isNaN(Date.parse(value)),
      'Ngày sinh không hợp lệ',
    )
    .optional(),
  region: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === undefined || value === '' || /^[A-Z]{2}$/.test(value),
      'Mã vùng gồm 2 chữ in hoa, ví dụ VN',
    )
    .optional(),
  interests: z
    .array(z.string().trim().min(1).max(32))
    .max(5, 'Tối đa 5 sở thích'),
  seekingGender: z.enum(['male', 'female', 'any']),
  seekingAgeMin: z.number().int().min(18).max(99),
  seekingAgeMax: z.number().int().min(18).max(99),
});

export type UpdateProfileForm = z.infer<typeof updateProfileSchema>;
