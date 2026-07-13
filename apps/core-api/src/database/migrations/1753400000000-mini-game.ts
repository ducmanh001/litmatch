import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 5 — Mini Game (docs/services/mini-game-service.md). Game duy nhất ở bản này:
 * `rock_paper_scissors` — cột `game_type` là varchar (không phải bảng riêng) vì chỉ 1 giá trị,
 * mở rộng thêm giá trị enum khi có game thứ 2 (spec § 2), không đổi cấu trúc bảng.
 *
 * Chốt chặn ở tầng DB — CÙNG kỹ thuật `movie_sessions`/`movie_session_active_participants`
 * (migration 1753200000000, đọc comment ở đó để biết vì sao KHÔNG dùng 2 partial unique index
 * đơn cột trên `user_low_id`/`user_high_id`):
 * - chk_mini_game_sessions_canonical: cặp low < high.
 * - `mini_game_active_participants` (PK `user_id`): 1 user chỉ có 1 MiniGameSession
 *   `waiting_moves` tại 1 thời điểm, BẤT KỂ họ là `userLowId` hay `userHighId` của session đó.
 *   Ghi/xoá 2 dòng (low, high) LUÔN cùng transaction với thay đổi `MiniGameSession.status`
 *   (`MiniGameService.createSession`/`submitMove` khi resolve/`cancelSession`).
 */
export class MiniGame1753400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE mini_game_sessions (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_low_id    uuid        NOT NULL REFERENCES users(id),
        user_high_id   uuid        NOT NULL REFERENCES users(id),
        game_type      varchar(32) NOT NULL DEFAULT 'rock_paper_scissors',
        low_move       varchar(16) NULL,
        high_move      varchar(16) NULL,
        status         varchar(16) NOT NULL DEFAULT 'waiting_moves',
        winner_user_id uuid        NULL REFERENCES users(id),
        resolved_at    timestamptz NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_mini_game_sessions_canonical CHECK (user_low_id < user_high_id),
        CONSTRAINT chk_mini_game_sessions_game_type CHECK (game_type IN ('rock_paper_scissors')),
        CONSTRAINT chk_mini_game_sessions_low_move
          CHECK (low_move IS NULL OR low_move IN ('rock', 'paper', 'scissors')),
        CONSTRAINT chk_mini_game_sessions_high_move
          CHECK (high_move IS NULL OR high_move IN ('rock', 'paper', 'scissors')),
        CONSTRAINT chk_mini_game_sessions_status
          CHECK (status IN ('waiting_moves', 'resolved', 'cancelled')),
        CONSTRAINT chk_mini_game_sessions_winner
          CHECK (winner_user_id IS NULL OR winner_user_id IN (user_low_id, user_high_id))
      )
    `);
    // Tra cứu cặp đang chờ move (idempotent create) — bổ trợ, KHÔNG phải nguồn enforce bất biến
    // (nguồn enforce thật là mini_game_active_participants bên dưới).
    await queryRunner.query(
      `CREATE INDEX idx_mini_game_sessions_pair_status ON mini_game_sessions(user_low_id, user_high_id, status)`,
    );

    await queryRunner.query(`
      CREATE TABLE mini_game_active_participants (
        user_id    uuid PRIMARY KEY REFERENCES users(id),
        session_id uuid NOT NULL REFERENCES mini_game_sessions(id)
      )
    `);
    // Xoá cả 2 dòng participant (low, high) khi resolve/cancel.
    await queryRunner.query(
      `CREATE INDEX idx_mini_game_active_participants_session
         ON mini_game_active_participants(session_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS mini_game_active_participants`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS mini_game_sessions`);
  }
}
