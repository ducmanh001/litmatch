import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const root = process.cwd();

test('session start chỉ in routing, workspace safety và gate thay vì roadmap backlog', async () => {
  const { stdout } = await run(
    process.execPath,
    ['scripts/agent/session-start.mjs'],
    {
      cwd: root,
      env: { ...process.env, AGENT_PROJECT_DIR: root },
    },
  );

  assert.match(stdout, /\[agent-session\] Định vị repo:/u);
  assert.match(stdout, /- Repo: /u);
  assert.match(stdout, /pnpm agent:context <scope>/u);
  assert.match(stdout, /Local changes có sẵn:/u);
  assert.match(stdout, /pnpm agent:check/u);
  assert.doesNotMatch(stdout, /Giai đoạn hiện tại|Frontend track|• \[ \]/u);
});
