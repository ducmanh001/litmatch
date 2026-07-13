import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (MESSAGE_CONTENT_HARD_CAP, docs/services/soul-match-service.md). */
export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, 'Nhập nội dung tin nhắn').max(1000),
});

export type SendMessageForm = z.infer<typeof sendMessageSchema>;
