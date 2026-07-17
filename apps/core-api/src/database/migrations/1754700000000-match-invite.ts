import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CTA "mời Voice/Soul Match" (W4, docs/services/matching-service.md § Invite, mở rộng module
 * `matching`). `uq_match_invites_pending_pair`: tối đa 1 invite PENDING/cặp (inviter, invitee) —
 * partial unique index, KHÔNG áp cho invite đã Accepted/Declined/Expired/Cancelled (mời lại được
 * sau khi invite cũ kết thúc).
 */
export class MatchInvite1754700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE match_invites (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        inviter_user_id   uuid NOT NULL REFERENCES users(id),
        invitee_user_id   uuid NOT NULL REFERENCES users(id),
        match_type        varchar(8) NOT NULL CHECK (match_type IN ('soul','voice')),
        status            varchar(16) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','accepted','declined','expired','cancelled')),
        expires_at        timestamptz NOT NULL,
        responded_at      timestamptz NULL,
        session_id        uuid NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_match_invites_not_self CHECK (inviter_user_id != invitee_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_match_invites_inviter ON match_invites (inviter_user_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_match_invites_invitee_status ON match_invites (invitee_user_id, status)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_match_invites_pending_pair ON match_invites
        (inviter_user_id, invitee_user_id) WHERE status = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS match_invites`);
  }
}
