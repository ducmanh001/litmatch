/**
 * Emit OpenAPI spec ra `openapi/core-api.json` (docs/12 § 12.3) — chạy qua
 * `pnpm openapi:emit`. Preview mode chỉ scan module metadata, không instantiate provider,
 * kết nối hạ tầng hay chạy background job. Spec được commit vào repo — đổi API thì chạy
 * `pnpm openapi:sync` trong cùng PR.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { NestFactory } from '@nestjs/core';
import { format } from 'prettier';

import { AppModule } from './app/app.module';
import {
  API_GLOBAL_PREFIX,
  API_PREFIX_EXCLUDES,
  buildOpenApiDocument,
} from './app/openapi';

const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg?.slice('--output='.length);
const OUTPUT_PATH = outputPath
  ? resolve(process.cwd(), outputPath)
  : resolve(__dirname, '../../../openapi/core-api.json');

async function emit(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    preview: true,
  });
  app.setGlobalPrefix(API_GLOBAL_PREFIX, { exclude: API_PREFIX_EXCLUDES });
  const doc = buildOpenApiDocument(app);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  const output = await format(JSON.stringify(doc), { parser: 'json' });
  writeFileSync(OUTPUT_PATH, output);
  await app.close();
  process.stdout.write(`OpenAPI spec written to ${OUTPUT_PATH}\n`);
}

emit().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
