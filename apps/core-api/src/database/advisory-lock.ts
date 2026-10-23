import type { EntityManager } from 'typeorm';

/**
 * Khoá advisory theo `(scope, id)` giữ tới hết transaction: tuần tự hoá các lượt của CÙNG MỘT đối tượng (vd một user
 * bấm hai lần / mở hai tab) mà không xếp hàng giữa các đối tượng khác nhau — khác khoá toàn cục.
 *
 * Quy tắc dùng, để không tạo chu trình chờ: gọi nó TRƯỚC mọi khoá khác của transaction và chỉ một khoá advisory mỗi
 * transaction. Người giữ khoá chỉ chờ khoá hàng của người khác, còn người đang chờ khoá advisory chưa giữ gì cả.
 * Đụng hash chỉ làm hai đối tượng khác nhau chờ nhau thêm, không sai kết quả.
 */
export async function lockAdvisoryXact(
  manager: EntityManager,
  scope: string,
  id: string,
): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `${scope}:${id}`,
  ]);
}
