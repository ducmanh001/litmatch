import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Query chuẩn cho mọi list lớn dần vô hạn — cursor-based (docs/05 § 5.4). */
export class CursorPageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface CursorPageMeta {
  nextCursor: string | null;
}

/** Kết quả chuẩn service trả cho controller với mọi list cursor-based. */
export interface CursorPage<T> {
  items: T[];
  meta: CursorPageMeta;
}

/**
 * Cursor mã hoá base64url từ payload vị trí (vd { createdAt, id }) — opaque với client,
 * client chỉ echo lại nguyên chuỗi. KHÔNG nhét dữ liệu nhạy cảm vào payload.
 */
export function encodeCursor(payload: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Giải cursor client gửi lên. Cursor hỏng/không phải JSON object → trả null —
 * caller tự quyết (thường throw DomainException `*_CURSOR_INVALID` của module mình,
 * lib shared này không ép mã lỗi domain).
 */
export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string,
): T | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );
    return typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as T)
      : null;
  } catch {
    return null;
  }
}

/**
 * Helper chuẩn: query dư 1 row (limit + 1) rồi đưa vào đây — tự cắt về limit
 * và sinh nextCursor từ row cuối. `toCursorPayload` chọn field làm vị trí.
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  toCursorPayload: (last: T) => Record<string, string | number>,
): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    meta: {
      nextCursor: hasMore && last ? encodeCursor(toCursorPayload(last)) : null,
    },
  };
}
