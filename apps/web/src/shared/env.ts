import { z } from 'zod';

/**
 * Nguồn duy nhất đọc env phía client (docs/13 § 13.10, guard enforce). Next inline
 * `process.env.NEXT_PUBLIC_*` lúc build theo TÊN BIẾN literal — bắt buộc liệt kê từng biến,
 * không đọc động. Prefix NEXT_PUBLIC = công khai trong bundle, không bao giờ chứa secret.
 */
const envSchema = z.object({
  /** Origin core-api, KHÔNG kèm /api/v1 (spec đã chứa prefix trong path). */
  NEXT_PUBLIC_API_URL: z.url(),
  /** Origin signaling-gateway (Socket.IO). */
  NEXT_PUBLIC_SOCKET_URL: z.url(),
  /** URL LiveKit SFU (ws://). */
  NEXT_PUBLIC_LIVEKIT_URL: z.url(),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env['NEXT_PUBLIC_API_URL'],
  NEXT_PUBLIC_SOCKET_URL: process.env['NEXT_PUBLIC_SOCKET_URL'],
  NEXT_PUBLIC_LIVEKIT_URL: process.env['NEXT_PUBLIC_LIVEKIT_URL'],
});
