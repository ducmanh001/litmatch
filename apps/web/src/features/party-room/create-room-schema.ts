import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (PARTY_TITLE_MAX_LENGTH, mặc định 100). */
export const createRoomSchema = z.object({
  title: z.string().trim().min(1, 'Nhập tên phòng').max(100),
  category: z.enum(['talk', 'sing', 'friend', 'study', 'other']),
});

export type CreateRoomForm = z.infer<typeof createRoomSchema>;
