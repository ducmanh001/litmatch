import { MigrationInterface, QueryRunner } from 'typeorm';

/** Lượt first-contact trực tiếp để gate profile nổi tiếng theo ngày UTC. */
export class ProfileChatContact1757600000000 implements MigrationInterface {
  name = 'ProfileChatContact1757600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE profile_chat_contacts (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        profile_user_id    uuid NOT NULL REFERENCES users(id),
        requester_user_id  uuid NOT NULL REFERENCES users(id),
        first_contact_date date NOT NULL,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_profile_chat_contacts_pair
          UNIQUE (profile_user_id, requester_user_id),
        CONSTRAINT chk_profile_chat_contacts_not_self
          CHECK (profile_user_id <> requester_user_id)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_profile_chat_contacts_profile_date
      ON profile_chat_contacts(profile_user_id, first_contact_date)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS profile_chat_contacts`);
  }
}
