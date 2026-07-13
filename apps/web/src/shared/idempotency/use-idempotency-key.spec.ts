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
});
