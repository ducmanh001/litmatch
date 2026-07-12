/**
 * Mã lỗi + helper đọc lỗi driver Postgres — dùng chung cho luồng chuẩn
 * "cố INSERT → bắt unique violation → đọc lại" (docs/05 § 5.10) ở mọi module.
 * Đặt tại `database/` (hạ tầng DB dùng chung, không thuộc module nghiệp vụ nào) —
 * không để từng module tự khai lại '23505' + copy helper, sửa 1 chỗ quên chỗ kia (docs/05 § 5.1).
 */
export const PG_UNIQUE_VIOLATION = '23505';

/** So driver error code, kèm fallback driverError (pg driver bọc code gốc trong đó). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; driverError?: { code?: string } };
  return (e.driverError?.code ?? e.code) === PG_UNIQUE_VIOLATION;
}

/** So đúng tên constraint (không suy đoán qua message) — fallback message.includes cho driver cũ không trả constraint. */
export function violatedConstraint(err: unknown, constraint: string): boolean {
  const e = err as { driverError?: { constraint?: string }; constraint?: string; message?: string };
  const name = e.driverError?.constraint ?? e.constraint;
  return name === constraint || (e.message?.includes(constraint) ?? false);
}
