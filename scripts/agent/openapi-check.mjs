#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'litmatch-openapi-'));
const temporarySpec = join(temporaryDirectory, 'core-api.json');
const temporaryClient = join(temporaryDirectory, 'core-api.ts');

function run(args) {
  const result = spawnSync(pnpm, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

try {
  run([
    'exec',
    'ts-node',
    '--project',
    'apps/core-api/tsconfig.app.json',
    '-r',
    'tsconfig-paths/register',
    'apps/core-api/src/openapi-emit.ts',
    `--output=${temporarySpec}`,
  ]);
  run(['exec', 'openapi-typescript', temporarySpec, '-o', temporaryClient]);
  writeFileSync(
    temporaryClient,
    await format(readFileSync(temporaryClient, 'utf8'), {
      parser: 'typescript',
      singleQuote: true,
    }),
  );

  const outputs = [
    [temporarySpec, join(root, 'openapi/core-api.json')],
    [temporaryClient, join(root, 'libs/api-client/src/generated/core-api.ts')],
  ];
  const drifted = outputs
    .filter(
      ([temporary, tracked]) =>
        readFileSync(temporary, 'utf8') !== readFileSync(tracked, 'utf8'),
    )
    .map(([, tracked]) => relative(root, tracked));

  if (drifted.length > 0) {
    console.error(
      `OpenAPI contract drift: ${drifted.join(', ')}. Chạy pnpm openapi:sync và commit output.`,
    );
    process.exitCode = 1;
  } else {
    console.log('OpenAPI contract check: PASS');
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
