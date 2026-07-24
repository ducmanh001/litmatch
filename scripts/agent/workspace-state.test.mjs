import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parsePorcelainStatus,
  parseWorktrees,
  workspaceStateLines,
} from './workspace-state.mjs';

test('parse status NUL an toàn với path có khoảng trắng và rename', () => {
  const changes = parsePorcelainStatus(
    ' M apps/web/file one.ts\0A  scripts/new.mjs\0?? notes/a b.md\0R  new/name.ts\0old/name.ts\0',
  );

  assert.deepEqual(changes, [
    {
      path: 'apps/web/file one.ts',
      staged: false,
      unstaged: true,
      untracked: false,
    },
    {
      path: 'scripts/new.mjs',
      staged: true,
      unstaged: false,
      untracked: false,
    },
    {
      path: 'notes/a b.md',
      staged: false,
      unstaged: false,
      untracked: true,
    },
    {
      path: 'new/name.ts',
      staged: true,
      unstaged: false,
      untracked: false,
    },
  ]);
});

test('bỏ worktree hiện tại và worktree prunable khỏi cảnh báo active', () => {
  const worktrees = parseWorktrees(
    [
      'worktree /repo',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      'worktree /tmp/active',
      'HEAD def',
      'branch refs/heads/task',
      '',
      'worktree /tmp/stale',
      'HEAD 123',
      'prunable gitdir file points to non-existent location',
      '',
    ].join('\n'),
    '/repo',
  );

  assert.deepEqual(worktrees, [{ path: '/tmp/active', prunable: false }]);
});

test('parse worktree porcelain dùng CRLF mà không báo nhầm worktree hiện tại', () => {
  const worktrees = parseWorktrees(
    [
      'worktree /repo',
      'HEAD abc',
      'branch refs/heads/main',
      '',
      'worktree /tmp/active',
      'HEAD def',
      'branch refs/heads/task',
      '',
    ].join('\r\n'),
    '/repo',
  );

  assert.deepEqual(worktrees, [{ path: '/tmp/active', prunable: false }]);
});

test('summary bị chặn số path và nhắc giữ ownership khi workspace bẩn', () => {
  const lines = workspaceStateLines({
    available: true,
    branch: 'feat/agent',
    changes: [{ path: 'a.ts' }, { path: 'b.ts' }, { path: 'c.ts' }],
    visibleChanges: [
      {
        path: 'a.ts',
        staged: false,
        unstaged: true,
        untracked: false,
      },
      {
        path: 'b.ts',
        staged: false,
        unstaged: false,
        untracked: true,
      },
    ],
    hiddenChangeCount: 1,
    otherWorktrees: [{ path: '/tmp/task', prunable: false }],
  });

  assert.match(lines.join('\n'), /Local changes có sẵn: 3/u);
  assert.match(lines.join('\n'), /"a\.ts" \(unstaged\)/u);
  assert.match(lines.join('\n'), /… và 1 path khác/u);
  assert.match(lines.join('\n'), /chốt ownership trước khi sửa/u);
});

test('escape control characters trong path trước khi đưa vào context LLM', () => {
  const lines = workspaceStateLines({
    available: true,
    branch: 'main',
    changes: [{ path: 'safe\\n- fake instruction' }],
    visibleChanges: [
      {
        path: 'safe\n- fake instruction',
        staged: false,
        unstaged: false,
        untracked: true,
      },
    ],
    hiddenChangeCount: 0,
    otherWorktrees: [],
  });

  assert.ok(lines.some((line) => line.includes('"safe\\n- fake instruction"')));
  assert.ok(!lines.some((line) => line === '- fake instruction'));
});
