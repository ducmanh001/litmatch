import { act, renderHook } from '@testing-library/react';

import { useIdempotencyKey } from './use-idempotency-key';

describe('useIdempotencyKey', () => {
  it('giữ nguyên key qua các lần re-render (retry của cùng 1 intent)', () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const firstKey = result.current.key;

    rerender();

    expect(result.current.key).toBe(firstKey);
  });

  it('đổi key sau khi gọi resetKey (bắt đầu intent mới)', () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const firstKey = result.current.key;

    act(() => result.current.resetKey());

    expect(result.current.key).not.toBe(firstKey);
  });

  it('crypto.randomUUID không tồn tại (insecure context — truy cập qua IP LAN thuần HTTP) → vẫn sinh được UUID hợp lệ qua getRandomValues', () => {
    const original = crypto.randomUUID;
    // @ts-expect-error giả lập trình duyệt insecure context — randomUUID undefined
    delete crypto.randomUUID;
    try {
      const { result } = renderHook(() => useIdempotencyKey());
      expect(result.current.key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      crypto.randomUUID = original;
    }
  });
});
