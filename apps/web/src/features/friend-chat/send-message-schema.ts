import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (FRIEND_MESSAGE_MAX_LENGTH, mặc định 2000). */
export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(1000).optional(),
    imageUrl: z.union([z.literal(''), z.string().trim().url()]).optional(),
  })
  .refine(
    (value) =>
      (value.content?.length ?? 0) > 0 || (value.imageUrl?.length ?? 0) > 0,
    { message: 'Nhập nội dung hoặc thêm ảnh', path: ['content'] },
  );

export type SendMessageForm = z.infer<typeof sendMessageSchema>;
