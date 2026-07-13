'use client';

import { useRef } from 'react';

/**
 * 1 UUID cho MỘT intent của user (vd mount form join-queue, hoặc bấm nút speedup) — giữ
 * nguyên qua các lần retry của intent đó (docs/13 § 13.4: Idempotency-Key sinh theo intent,
 * không phải theo mỗi lần gọi network). Gọi `resetKey()` khi intent kết thúc thành công và
 * user chuẩn bị bắt đầu 1 intent MỚI (vd: tin nhắn tiếp theo, lần bấm speedup tiếp theo).
 */
export function useIdempotencyKey(): { key: string; resetKey: () => void } {
  const ref = useRef(crypto.randomUUID());
  return {
    get key() {
      return ref.current;
    },
    resetKey: () => {
      ref.current = crypto.randomUUID();
    },
  };
}
