import 'dotenv/config';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * DataSource cho TypeORM CLI (migration) — runtime dùng TypeOrmModule trong app.module.ts.
 * Chạy: pnpm nx run core-api:migration-run (xem project.json).
 */
const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  // Cố ý KHÔNG fallback DB local: migration là lệnh phá huỷ schema — thiếu env mà âm thầm
  // chạy vào 1 DB mặc định là chạy nhầm DB ngoài ý muốn. Fail to, fail sớm.
  throw new Error(
    'DATABASE_URL chưa được set — `cp .env.example .env` hoặc export trước khi chạy migration.',
  );
}

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: ['apps/core-api/src/modules/**/entities/*.entity.ts'],
  migrations: ['apps/core-api/src/database/migrations/*.ts'],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false, // cấm tuyệt đối, kể cả dev — schema chỉ đổi qua migration (docs/04)
  logging: ['error', 'migration'],
});
