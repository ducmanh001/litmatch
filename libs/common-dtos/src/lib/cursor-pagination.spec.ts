import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  buildCursorPage,
  CursorPageQueryDto,
  decodeCursor,
  encodeCursor,
  isValidSeqCursor,
} from './cursor-pagination';

describe('CursorPageQueryDto', () => {
  it('mặc định limit = 20', () => {
    const dto = plainToInstance(CursorPageQueryDto, {});
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.limit).toBe(20);
  });

  it('chặn limit vượt 100 — query không giới hạn là lỗi hay gặp (docs/10 § 10.1.F)', () => {
    const dto = plainToInstance(CursorPageQueryDto, { limit: '500' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('ép kiểu limit từ query string', () => {
    const dto = plainToInstance(CursorPageQueryDto, {
      limit: '50',
      cursor: 'abc',
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.limit).toBe(50);
  });
});

describe('cursor helpers', () => {
  it('encode/decode round-trip', () => {
    const payload = { createdAt: '2026-07-12T00:00:00Z', id: 'abc' };
    expect(decodeCursor(encodeCursor(payload))).toEqual(payload);
  });

  it.each([
    'not-base64!!!',
    Buffer.from('"chuoi-tran"').toString('base64url'),
    Buffer.from('[1,2]').toString('base64url'),
    '',
  ])('cursor hỏng/không phải object → null (%s)', (bad) => {
    expect(decodeCursor(bad)).toBeNull();
  });

  it('buildCursorPage: đủ trang (limit+1 row) → cắt về limit, có nextCursor', () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const page = buildCursorPage(rows, 2, (last) => ({ id: last.id }));
    expect(page.items).toHaveLength(2);
    expect(decodeCursor(page.meta.nextCursor as string)).toEqual({ id: '2' });
  });

  it('buildCursorPage: trang cuối → giữ nguyên rows, nextCursor null', () => {
    const page = buildCursorPage([{ id: '1' }], 2, (last) => ({ id: last.id }));
    expect(page.items).toHaveLength(1);
    expect(page.meta.nextCursor).toBeNull();
  });

  it('buildCursorPage: rỗng → items rỗng, nextCursor null', () => {
    const page = buildCursorPage([], 2, () => ({ id: 'x' }));
    expect(page.items).toHaveLength(0);
    expect(page.meta.nextCursor).toBeNull();
  });
});

describe('isValidSeqCursor', () => {
  it('payload null → false', () => {
    expect(isValidSeqCursor(null)).toBe(false);
  });

  it('seq thiếu hoặc không phải string → false', () => {
    expect(isValidSeqCursor({})).toBe(false);
    expect(isValidSeqCursor({ seq: 123 })).toBe(false);
  });

  it('seq không phải chuỗi số → false', () => {
    expect(isValidSeqCursor({ seq: 'abc' })).toBe(false);
    expect(isValidSeqCursor({ seq: '12.3' })).toBe(false);
  });

  it('seq là chuỗi số → true', () => {
    expect(isValidSeqCursor({ seq: '0' })).toBe(true);
    expect(isValidSeqCursor({ seq: '42' })).toBe(true);
  });
});
