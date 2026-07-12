/**
 * Emit OpenAPI spec ra `openapi/core-api.json` (docs/12 § 12.3) — chạy qua
 * `pnpm openapi:emit`. Cần hạ tầng local (Postgres/Redis/Kafka) đang chạy vì AppModule
 * kết nối lúc init; CI dùng cùng docker compose. Spec được commit vào repo — đổi API
 * thì emit + gen lại trong cùng PR.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app/app.module';
import {
  API_GLOBAL_PREFIX,
  API_PREFIX_EXCLUDES,
  buildOpenApiDocument,
} from './app/openapi';

const OUTPUT_PATH = resolve(__dirname, '../../../openapi/core-api.json');

async function emit(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: API_PREFIX_EXCLUDES });
  const doc = buildOpenApiDocument(app);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  await app.close();
  process.stdout.write(`OpenAPI spec written to ${OUTPUT_PATH}\n`);
}

emit().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
