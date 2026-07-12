import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn 2 follow-up — bộ lọc giới tính khi ghép cặp (docs/01 #13, spec § 2/§ 5).
 * - gender_preference là snapshot lựa chọn của user cho LẦN vào queue này (đổi ý = cancel + join lại);
 *   check khớp 2 chiều nằm ở matcher `tryPair` (docs/10 § 10.0.C), KHÔNG shard theo gender.
 * - DEFAULT 'any': ticket tạo trước migration và client cũ không gửi field đều giữ hành vi cũ.
 * - CHECK enforce tập giá trị ở DB, cùng pattern match_type/status (migration matching-core).
 */
export class MatchingGenderPreference1752300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE match_tickets
        ADD COLUMN gender_preference varchar(10) NOT NULL DEFAULT 'any'
          CHECK (gender_preference IN ('any','male','female'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE match_tickets DROP COLUMN IF EXISTS gender_preference`,
    );
  }
}
