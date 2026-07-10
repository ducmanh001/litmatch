import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { CursorPageQueryDto } from './cursor-pagination';

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
    const dto = plainToInstance(CursorPageQueryDto, { limit: '50', cursor: 'abc' });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.limit).toBe(50);
  });
});
