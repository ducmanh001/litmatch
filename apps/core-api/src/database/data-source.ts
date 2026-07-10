import 'dotenv/config';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from './snake-naming.strategy';

/**
 * DataSource cho TypeORM CLI (migration) — runtime dùng TypeOrmModule trong app.module.ts.
 * Chạy: pnpm nx run core-api:migration-run (xem project.json).
 */
export default new DataSource({
  type: 'postgres',
  url: process.env['DATABASE_URL'] ?? 'postgresql://litmatch:litmatch_local@localhost:5432/litmatch',
  entities: ['apps/core-api/src/modules/**/entities/*.entity.ts'],
  migrations: ['apps/core-api/src/database/migrations/*.ts'],
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false, // cấm tuyệt đối, kể cả dev — schema chỉ đổi qua migration (docs/04)
  logging: ['error', 'migration'],
});
