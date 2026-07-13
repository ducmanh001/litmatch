import { z } from 'zod';

/**
 * Client chỉ chọn 2 field này — region/ageBand server tự derive
 * (docs/services/matching-service.md). Mặc định 'any' đặt ở `defaultValues` của form
 * (không dùng `.default()` ở đây — tránh input/output type lệch nhau khi dùng với RHF resolver).
 */
export const joinQueueSchema = z.object({
  matchType: z.enum(['soul', 'voice']),
  genderPreference: z.enum(['any', 'male', 'female']),
});

export type JoinQueueForm = z.infer<typeof joinQueueSchema>;
