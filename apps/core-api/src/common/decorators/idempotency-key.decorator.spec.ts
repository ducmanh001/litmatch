import { CommonErrors, DomainException } from '@litmatch/common-exceptions';

import { extractIdempotencyKey } from './idempotency-key.decorator';

describe('extractIdempotencyKey', () => {
  it('trả về key hợp lệ', () => {
    expect(extractIdempotencyKey({ 'idempotency-key': 'abc-123' })).toBe(
      'abc-123',
    );
  });

  it('lấy giá trị đầu khi header bị lặp thành mảng', () => {
    expect(extractIdempotencyKey({ 'idempotency-key': ['k1', 'k2'] })).toBe(
      'k1',
    );
  });

  it.each([
    [{}],
    [{ 'idempotency-key': '' }],
    [{ 'idempotency-key': '   ' }],
    [{ 'idempotency-key': 42 }],
  ])('thiếu/rỗng/sai kiểu → COMMON_IDEMPOTENCY_KEY_MISSING (%j)', (headers) => {
    try {
      extractIdempotencyKey(headers as Record<string, unknown>);
      fail('phải throw DomainException');
    } catch (e) {
      expect(e).toBeInstanceOf(DomainException);
      expect((e as DomainException).code).toBe(
        CommonErrors.IDEMPOTENCY_KEY_MISSING,
      );
      expect((e as DomainException).httpStatus).toBe(400);
    }
  });

  it('key quá 128 ký tự → COMMON_IDEMPOTENCY_KEY_INVALID', () => {
    try {
      extractIdempotencyKey({ 'idempotency-key': 'x'.repeat(129) });
      fail('phải throw DomainException');
    } catch (e) {
      expect((e as DomainException).code).toBe(
        CommonErrors.IDEMPOTENCY_KEY_INVALID,
      );
    }
  });
});
