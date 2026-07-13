import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (FRIEND_MESSAGE_MAX_LENGTH, mặc định 2000). */
export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Nhập nội dung tin nhắn').max(1000),
});

export type SendMessageForm = z.infer<typeof sendMessageSchema>;
