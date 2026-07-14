'use client';

import { useRef } from 'react';

/**
 * `crypto.randomUUID()` chỉ tồn tại ở secure context (HTTPS, hoặc `http://localhost`) — truy
 * cập qua IP LAN thuần HTTP (test trên điện thoại/thiết bị khác cùng mạng) thì hàm này
 * `undefined`, ném TypeError ngay lúc render. `crypto.getRandomValues` thì KHÔNG bị giới hạn
 * secure-context nên dùng làm nền tự dựng UUID v4 khi `randomUUID` không có.
 */
function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * 1 UUID cho MỘT intent của user (vd mount form join-queue, hoặc bấm nút speedup) — giữ
 * nguyên qua các lần retry của intent đó (docs/13 § 13.4: Idempotency-Key sinh theo intent,
 * không phải theo mỗi lần gọi network). Gọi `resetKey()` khi intent kết thúc thành công và
 * user chuẩn bị bắt đầu 1 intent MỚI (vd: tin nhắn tiếp theo, lần bấm speedup tiếp theo).
 */
export function useIdempotencyKey(): { key: string; resetKey: () => void } {
  const ref = useRef(randomUuid());
  return {
    get key() {
      return ref.current;
    },
    resetKey: () => {
      ref.current = randomUuid();
    },
  };
}
