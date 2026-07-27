import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const DEFAULT_PATH_LIMIT = 8;

function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 3000,
    maxBuffer: 1024 * 1024,
  });
}

export function parsePorcelainStatus(output) {
  if (!output) return [];

  const fields = output.split('\0');
  const changes = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field) continue;

    const status = field.slice(0, 2);
    const path = field.slice(3);
    const renamed = status.includes('R') || status.includes('C');
    if (renamed) index += 1;

    changes.push({
      path,
      staged: status[0] !== ' ' && status[0] !== '?',
      unstaged: status[1] !== ' ' && status[1] !== '?',
      untracked: status === '??',
    });
  }
  return changes;
}

export function parseWorktrees(output, currentRoot) {
  const entries = output
    .trim()
    .split(/\r?\n(?:\r?\n)+/u)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/u);
      return {
        path: lines
          .find((line) => line.startsWith('worktree '))
          ?.slice('worktree '.length),
        prunable: lines.some((line) => line.startsWith('prunable ')),
      };
    });

  return entries.filter(
    (entry) =>
      entry.path &&
      resolve(entry.path) !== resolve(currentRoot) &&
      entry.prunable === false,
  );
}

export function collectWorkspaceState(root, pathLimit = DEFAULT_PATH_LIMIT) {
  try {
    const changes = parsePorcelainStatus(
      git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=normal']),
    );
    const worktrees = parseWorktrees(
      git(root, ['worktree', 'list', '--porcelain']),
      root,
    );

    return {
      available: true,
      branch: git(root, ['branch', '--show-current']).trim() || '(detached)',
      changes,
      visibleChanges: changes.slice(0, pathLimit),
      hiddenChangeCount: Math.max(0, changes.length - pathLimit),
      otherWorktrees: worktrees,
    };
  } catch {
    return { available: false };
  }
}

export function workspaceStateLines(state, { includePaths = true } = {}) {
  if (!state.available) {
    return ['- Không đọc được trạng thái Git; tự kiểm tra trước khi sửa file.'];
  }

  const lines = [
    `- Branch: ${state.branch}`,
    `- Local changes có sẵn: ${state.changes.length}; worktree khác đang hoạt động: ${state.otherWorktrees.length}.`,
  ];

  if (includePaths && state.visibleChanges.length > 0) {
    lines.push('- Path đã thay đổi (giới hạn):');
    for (const change of state.visibleChanges) {
      const kinds = [
        change.staged && 'staged',
        change.unstaged && 'unstaged',
        change.untracked && 'untracked',
      ].filter(Boolean);
      lines.push(`  - ${JSON.stringify(change.path)} (${kinds.join(', ')})`);
    }
    if (state.hiddenChangeCount > 0) {
      lines.push(`  - … và ${state.hiddenChangeCount} path khác.`);
    }
  }

  if (state.changes.length > 0 || state.otherWorktrees.length > 0) {
    lines.push(
      '- Coi thay đổi có sẵn là phần việc của session khác: chốt ownership trước khi sửa, không revert file ngoài scope.',
    );
  }
  return lines;
}
