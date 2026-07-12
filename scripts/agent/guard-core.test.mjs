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
