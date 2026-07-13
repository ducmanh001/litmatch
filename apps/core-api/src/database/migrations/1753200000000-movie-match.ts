import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 5 — Movie Match (docs/services/movie-match-service.md). Không có bảng message
 * riêng — chat dùng thẳng `conversations`/`messages` của Friend Chat (§ 2).
 * Chốt chặn ở tầng DB:
 * - chk_movie_sessions_canonical: mirror friendships/conversations — cặp low < high.
 * - `movie_session_active_participants` (PK `user_id`): 1 user chỉ có 1 MovieSession active
 *   tại 1 thời điểm. KHÔNG dùng 2 partial unique index riêng trên `user_low_id`/`user_high_id`
 *   của `movie_sessions` — kỹ thuật đó KHÔNG đủ, vì 1 user có thể là `user_low_id` ở session A
 *   và `user_high_id` ở session B cùng lúc, mỗi index đơn cột không thấy xung đột CHÉO cột
 *   (bug này bị bắt bằng integration test race trước khi merge). PK gộp 1 cột `user_id` duy
 *   nhất mới chặn được toàn bộ — ghi/xoá 2 dòng (low, high) LUÔN cùng transaction với
 *   `MovieSession.status` (`MovieMatchService.createSession`/`endSession`).
 */
export class MovieMatch1753200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE movie_sessions (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_low_id         uuid             NOT NULL REFERENCES users(id),
        user_high_id        uuid             NOT NULL REFERENCES users(id),
        video_url           text             NOT NULL,
        position_seconds    double precision NOT NULL DEFAULT 0,
        is_playing          boolean          NOT NULL DEFAULT false,
        position_updated_at timestamptz      NOT NULL DEFAULT now(),
        status              varchar(16)      NOT NULL DEFAULT 'active',
        ended_at            timestamptz      NULL,
        end_reason          varchar(16)      NULL,
        created_at          timestamptz      NOT NULL DEFAULT now(),
        updated_at          timestamptz      NOT NULL DEFAULT now(),
        CONSTRAINT chk_movie_sessions_canonical CHECK (user_low_id < user_high_id),
        CONSTRAINT chk_movie_sessions_status CHECK (status IN ('active', 'ended')),
        CONSTRAINT chk_movie_sessions_end_reason
          CHECK (end_reason IS NULL OR end_reason IN ('left', 'replaced')),
        CONSTRAINT chk_movie_sessions_position_nonneg CHECK (position_seconds >= 0)
      )
    `);
    // Tra cứu cặp active (idempotent create) — bổ trợ, KHÔNG phải nguồn enforce bất biến
    // (nguồn enforce thật là movie_session_active_participants bên dưới).
    await queryRunner.query(
      `CREATE INDEX idx_movie_sessions_pair_status ON movie_sessions(user_low_id, user_high_id, status)`,
    );

    await queryRunner.query(`
      CREATE TABLE movie_session_active_participants (
        user_id    uuid PRIMARY KEY REFERENCES users(id),
        session_id uuid NOT NULL REFERENCES movie_sessions(id)
      )
    `);
    // Xoá cả 2 dòng participant (low, high) khi kết thúc session
    await queryRunner.query(
      `CREATE INDEX idx_movie_session_active_participants_session
         ON movie_session_active_participants(session_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS movie_session_active_participants`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS movie_sessions`);
  }
}
