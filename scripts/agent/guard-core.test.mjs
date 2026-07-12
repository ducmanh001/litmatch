import assert from 'node:assert/strict';
import test from 'node:test';

import { inspectChange, inspectCommand } from './guard-core.mjs';

test('blocks a fourth deployable app', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/feed-service/src/main.ts',
      content: 'export {}',
      operation: 'create',
    }).join('\n'),
    /Không được tạo/u,
  );
});

test('allows an existing app and a domain module', () => {
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/core-api/src/modules/feed/feed.module.ts',
      content: 'export class FeedModule {}',
      operation: 'create',
    }),
    [],
  );
});

test('blocks TypeORM synchronize true', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/core-api/src/app.module.ts',
      content: 'synchronize: true',
    }).join('\n'),
    /synchronize/u,
  );
});

test('allows forbidden-pattern fixtures in tests', () => {
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/core-api/src/config/typeorm.spec.ts',
      content: 'synchronize: true',
    }),
    [],
  );
});

test('blocks ledger mutation outside tests', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/core-api/src/modules/economy/repair.ts',
      content: 'DELETE FROM ledger_entries WHERE id = $1',
    }).join('\n'),
    /append-only/u,
  );
});

test('allows ledger mutation text in a test fixture', () => {
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/core-api/src/modules/economy/repair.spec.ts',
      content: 'DELETE FROM ledger_entries WHERE id = $1',
    }),
    [],
  );
});

test('blocks modification of a tracked migration', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/core-api/src/database/migrations/1-init.ts',
      content: 'export class Init {}',
      operation: 'modify',
      tracked: true,
    }).join('\n'),
    /bất biến/u,
  );
});

test('allows creation of a new migration', () => {
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/core-api/src/database/migrations/2-add-feed.ts',
      content: 'export class AddFeed {}',
      operation: 'create',
      tracked: false,
    }),
    [],
  );
});

test('blocks destructive migration shell commands', () => {
  assert.match(
    inspectCommand('rm apps/core-api/src/database/migrations/1-init.ts').join(
      '\n',
    ),
    /migration/u,
  );
});

test('allows frontend apps admin/web (docs/12)', () => {
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/admin/src/main.tsx',
      content: 'export {}',
      operation: 'create',
    }),
    [],
  );
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/web/src/app/layout.tsx',
      content: 'export {}',
      operation: 'create',
    }),
    [],
  );
});

test('FE: blocks env access outside shared/env.ts, allows env module and build config', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/admin/src/features/users/api.ts',
      content: 'const u = import.meta.env.VITE_API_URL;',
    }).join('\n'),
    /shared\/env\.ts/u,
  );
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/web/src/shared/env.ts',
      content: 'process.env.NEXT_PUBLIC_API_URL',
    }),
    [],
  );
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/web/next.config.js',
      content: 'process.env.NODE_ENV',
    }),
    [],
  );
});

test('FE: blocks hand-written fetch/axios — REST must go through api-client', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/web/src/features/feed/api.ts',
      content: 'await fetch(`${url}/feed`)',
    }).join('\n'),
    /api-client/u,
  );
  assert.match(
    inspectChange({
      filePath: 'apps/admin/src/shared/lib/http.ts',
      content: "import axios from 'axios';",
    }).join('\n'),
    /api-client/u,
  );
});

test('FE: blocks main common-dtos entry and core-api imports', () => {
  assert.match(
    inspectChange({
      filePath: 'apps/web/src/shared/realtime/socket.ts',
      content: "import { RealtimeEvents } from '@litmatch/common-dtos';",
    }).join('\n'),
    /pure/u,
  );
  assert.deepEqual(
    inspectChange({
      filePath: 'apps/web/src/shared/realtime/socket.ts',
      content: "import { RealtimeEvents } from '@litmatch/common-dtos/pure';",
    }),
    [],
  );
  assert.match(
    inspectChange({
      filePath: 'apps/admin/src/shared/api/client.ts',
      content: "import { x } from '../../../core-api/src/modules/user';",
    }).join('\n'),
    /apps\/core-api/u,
  );
});
