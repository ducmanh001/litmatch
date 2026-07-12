import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const adapter = new URL('./pre-tool-guard.mjs', import.meta.url);

function run(payload) {
  return spawnSync(process.execPath, [adapter.pathname], {
    cwd: new URL('../../', import.meta.url),
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
}

test('pre-tool adapter blocks a forbidden app write', () => {
  const result = run({
    tool_name: 'Write',
    tool_input: {
      file_path: 'apps/feed-service/src/main.ts',
      content: 'export {}',
    },
  });

  assert.equal(result.status, 2);
  assert.match(result.stderr, /BLOCKED \(agent guard\)/u);
});

test('pre-tool adapter blocks destructive migration commands', () => {
  const result = run({
    tool_name: 'exec_command',
    tool_input: {
      cmd: 'rm apps/core-api/src/database/migrations/1751900000000-init-auth-user.ts',
    },
  });

  assert.equal(result.status, 2);
});

test('pre-tool adapter allows a safe module write', () => {
  const result = run({
    tool_name: 'Write',
    tool_input: {
      file_path: 'apps/core-api/src/modules/feed/feed.module.ts',
      content: 'export class FeedModule {}',
    },
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
});
