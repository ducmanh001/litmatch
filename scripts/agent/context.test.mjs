import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const root = process.cwd();

test('context map tách tài liệu bắt buộc khỏi tài liệu theo điều kiện', async () => {
  const map = JSON.parse(await readFile('.agents/context-map.json', 'utf8'));

  assert.ok(map.core.read.includes('docs/05-coding-standards.md'));
  assert.ok(!map.core.read.includes('docs/10-code-review-checklist.md'));
  assert.deepEqual(
    map.core.readWhen.find(
      (item) => item.path === 'docs/10-code-review-checklist.md',
    ),
    {
      path: 'docs/10-code-review-checklist.md',
      when: 'plan/verify business flow; chỉ đọc § 10.0 + mục domain áp dụng',
    },
  );
});

test('mọi scope đều nạp compact project memory ở startup', async () => {
  const map = JSON.parse(await readFile('.agents/context-map.json', 'utf8'));

  for (const [scope, entry] of Object.entries(map)) {
    assert.ok(
      entry.read.includes('docs/reference/project-memory.md'),
      `${scope} thiếu compact project memory`,
    );
    assert.equal(
      entry.read[1],
      'docs/reference/project-memory.md',
      `${scope} không đặt compact project memory ngay sau AGENTS.md`,
    );
  }
});

test('full project handoff chỉ nạp theo điều kiện, không phình startup context', async () => {
  const map = JSON.parse(await readFile('.agents/context-map.json', 'utf8'));

  for (const [scope, entry] of Object.entries(map)) {
    assert.ok(
      !entry.read.includes('docs/reference/project-handoff.md'),
      `${scope} đang nạp full handoff ở startup`,
    );
  }
  for (const scope of ['default', 'docs', 'agents']) {
    assert.ok(
      map[scope].readWhen.some(
        (item) => item.path === 'docs/reference/project-handoff.md',
      ),
      `${scope} thiếu route tới full handoff`,
    );
  }
});

test('docs scope route onboarding, learning và checks riêng', async () => {
  const map = JSON.parse(await readFile('.agents/context-map.json', 'utf8'));

  assert.deepEqual(map.docs.read, [
    'AGENTS.md',
    'docs/reference/project-memory.md',
    'docs/00-overview-and-index.md',
    'docs/18-documentation-automation.md',
    'docs/19-project-lifecycle-and-learning.md',
  ]);
  assert.ok(
    map.docs.readWhen.some(
      (item) => item.path === 'docs/reference/lessons-registry.md',
    ),
  );
  assert.ok(
    map.docs.readWhen.some(
      (item) => item.path === 'docs/reference/project-handoff.md',
    ),
  );
  assert.deepEqual(map.docs.checks, [
    'pnpm docs:check',
    'pnpm agent:check',
    'pnpm format:check',
  ]);

  const { stdout } = await run(
    process.execPath,
    ['scripts/agent/context.mjs', 'docs'],
    { cwd: root },
  );
  assert.match(stdout, /# Agent context — docs/u);
  assert.match(stdout, /docs\/19-project-lifecycle-and-learning\.md/u);
  assert.match(stdout, /pnpm docs:check/u);
});

test('agents scope route AI-native harness, eval và checks riêng', async () => {
  const map = JSON.parse(await readFile('.agents/context-map.json', 'utf8'));

  assert.deepEqual(map.agents.read, [
    'AGENTS.md',
    'docs/reference/project-memory.md',
    'docs/20-ai-native-handbook.md',
    'docs/08-working-with-agents.md',
    'docs/14-rule-enforcement-matrix.md',
  ]);
  assert.ok(
    map.agents.readWhen.some(
      (item) => item.path === 'docs/10-code-review-checklist.md',
    ),
  );
  assert.ok(
    map.agents.readWhen.some(
      (item) => item.path === 'docs/reference/project-handoff.md',
    ),
  );
  assert.deepEqual(map.agents.checks, [
    'pnpm agent:check',
    'pnpm agent:test',
    'pnpm docs:check',
    'pnpm format:check',
  ]);

  const { stdout } = await run(
    process.execPath,
    ['scripts/agent/context.mjs', 'agents'],
    { cwd: root },
  );
  assert.match(stdout, /# Agent context — agents/u);
  assert.match(stdout, /docs\/20-ai-native-handbook\.md/u);
  assert.match(stdout, /pnpm agent:test/u);
});

test('agent:context in rõ routing điều kiện', async () => {
  const { stdout } = await run(
    process.execPath,
    ['scripts/agent/context.mjs', 'content'],
    { cwd: root },
  );

  assert.match(stdout, /## Read first/u);
  assert.match(stdout, /## Read when applicable/u);
  assert.match(stdout, /## Shared-workspace safety/u);
  assert.match(stdout, /Local changes có sẵn:/u);
  assert.match(
    stdout,
    /docs\/services\/movie-match-service\.md — chạm Movie Match/u,
  );
  assert.match(
    stdout,
    /docs\/services\/palm-match-service\.md — chạm Palm Match/u,
  );
  assert.match(
    stdout,
    /docs\/services\/mini-game-service\.md — chạm Mini Game/u,
  );
});
