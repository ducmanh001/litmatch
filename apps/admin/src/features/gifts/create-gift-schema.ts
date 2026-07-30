import { z } from 'zod';

export const createGiftSchema = z.object({
  code: z.string().min(1, 'Bắt buộc').max(64),
  name: z.string().min(1, 'Bắt buộc').max(128),
  priceDiamond: z.coerce.number().int().min(1, 'Phải >= 1'),
});

export type CreateGiftFormInput = z.input<typeof createGiftSchema>;
export type CreateGiftForm = z.output<typeof createGiftSchema>;
