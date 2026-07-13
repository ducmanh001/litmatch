#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { inspectChange } from './guard-core.mjs';
import { findBrokenMarkdownLinks } from './markdown-links.mjs';
import {
  SUPPRESS_MARKER,
  findVendorNameViolations,
} from './vendor-wording.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const errors = [];
const stagedMode = process.argv.includes('--staged');
const trackedFiles = new Set(
  execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean),
);

function git(args, fallback = '') {
  try {
    return execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return fallback;
  }
}

function addError(message) {
  errors.push(message);
}

function validateContextMap() {
  const path = join(root, '.agents/context-map.json');
  const map = JSON.parse(readFileSync(path, 'utf8'));
  for (const [scope, entry] of Object.entries(map)) {
    for (const target of [...(entry.read ?? []), ...(entry.paths ?? [])]) {
      if (!existsSync(join(root, target))) {
        addError(
          `Context scope ${scope} trỏ tới path không tồn tại: ${target}`,
        );
      }
    }
  }
}

function validateSkill(skillPath) {
  const content = readFileSync(join(root, skillPath), 'utf8');
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
  const keys = frontmatter
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split(':', 1)[0].trim());
  if (!keys.includes('name') || !keys.includes('description')) {
    addError(`Skill thiếu name/description: ${skillPath}`);
  }
  const extra = keys.filter((key) => !['name', 'description'].includes(key));
  if (extra.length)
    addError(`Skill có frontmatter dư (${extra.join(', ')}): ${skillPath}`);
}

function changedFiles() {
  if (stagedMode) {
    return git(['diff', '--cached', '--name-status', '--find-renames'])
      .split('\n')
      .filter(Boolean);
  }

  const baseFlagIndex = process.argv.indexOf('--base');
  const requestedBase =
    (baseFlagIndex >= 0 ? process.argv[baseFlagIndex + 1] : undefined) ??
    process.env.AGENT_BASE_SHA;
  const validBase =
    requestedBase &&
    !/^0+$/u.test(requestedBase) &&
    git(['cat-file', '-e', `${requestedBase}^{commit}`], 'missing') === '';
  const range = validBase ? [`${requestedBase}...HEAD`] : ['HEAD'];
  const lines = git(['diff', '--name-status', '--find-renames', ...range])
    .split('\n')
    .filter(Boolean);

  if (!validBase) {
    for (const path of git(['ls-files', '--others', '--exclude-standard'])
      .split('\n')
      .filter(Boolean)) {
      lines.push(`A\t${path}`);
    }
  }
  return lines;
}

function validateDiff() {
  for (const line of changedFiles()) {
    const [status, firstPath, secondPath] = line.split('\t');
    const renamed = status.startsWith('R');
    const filePath = renamed ? secondPath : firstPath;
    const oldPath = renamed ? firstPath : undefined;
    const operation = status.startsWith('A')
      ? 'create'
      : status.startsWith('D')
        ? 'delete'
        : 'modify';

    if (renamed && /\/migrations\/[^/]+\.(ts|js|sql)$/u.test(oldPath)) {
      addError(`Migration đã commit không được rename: ${oldPath}`);
    }

    const absolute = join(root, filePath);
    const content =
      existsSync(absolute) && statSync(absolute).isFile()
        ? readFileSync(absolute, 'utf8')
        : '';
    for (const violation of inspectChange({
      filePath,
      content,
      operation,
      tracked: operation !== 'create',
    })) {
      addError(`${filePath}: ${violation}`);
    }
  }
}

const ignoredDirectories = new Set([
  '.git',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  // Thư mục cấu hình riêng 1 công cụ (đặt tên theo đúng công cụ đó, chỉ công cụ đó đọc) —
  // được phép nêu tên công cụ trong nội dung (vd $schema URL, ghi chú quirk riêng).
  // Nguyên tắc trung lập áp cho bề mặt DÙNG CHUNG (AGENTS.md, docs/, scripts/agent/),
  // không áp cho adapter đặt tên tường minh theo vendor.
  '.claude', // agent-check:allow-vendor-name — tên thư mục đúng là tên công cụ, không tránh được
]);
const ignoredFiles = new Set([
  'pnpm-lock.yaml',
  // Gitleaks baseline là report do scanner sinh ra; Message giữ nguyên commit metadata để
  // baseline match chính xác, nên không phải bề mặt hướng dẫn/code cần wording trung lập.
  '.gitleaks-baseline.json',
  'apps/core-api/src/database/migrations/1752000000000-economy-ledger.ts',
]);
const textFile = /(?:\.(md|mjs|cjs|js|ts|cts|json|ya?ml|toml)|Dockerfile)$/u;

function validateNeutralWording(directory = root) {
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name)) continue;
    const absolute = join(directory, name);
    const path = relative(root, absolute).replaceAll('\\', '/');
    if (ignoredFiles.has(path)) continue;
    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      validateNeutralWording(absolute);
    } else if (textFile.test(name) && (!stagedMode || trackedFiles.has(path))) {
      const content = readFileSync(absolute, 'utf8');
      for (const line of findVendorNameViolations(content)) {
        addError(
          `${path}:${line}: dùng tên nền tảng riêng; dùng từ "agent" thay thế, hoặc thêm ` +
            `'${SUPPRESS_MARKER}' trên dòng này/dòng trước nếu bắt buộc phải nêu tên cụ thể.`,
        );
      }
    }
  }
}

/**
 * File tương thích của từng công cụ là symlink trỏ về canonical (AGENTS.md,
 * .agents/skills/*) — không có bản sao nội dung nào có thể trôi khỏi canonical.
 * Nếu ai đó đổi tên/xoá file canonical mà quên cập nhật symlink, bắt lỗi ở đây
 * thay vì để adapter âm thầm biến mất.
 */
function validateSymlinks() {
  for (const path of trackedFiles) {
    const absolute = join(root, path);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch {
      continue;
    }
    if (!stat.isSymbolicLink()) continue;
    try {
      realpathSync(absolute);
    } catch {
      addError(
        `${path}: symlink gãy — target không tồn tại, sửa hoặc xoá symlink này.`,
      );
    }
  }
}

function validateMarkdownLinks() {
  const markdownFiles = new Set([
    ...trackedFiles,
    ...git(['ls-files', '--others', '--exclude-standard', '*.md'])
      .split('\n')
      .filter(Boolean),
  ]);
  for (const path of markdownFiles) {
    if (!path.endsWith('.md')) continue;
    const absolute = join(root, path);
    if (!existsSync(absolute)) continue;
    const content = readFileSync(absolute, 'utf8');
    for (const violation of findBrokenMarkdownLinks(
      absolute,
      content,
      existsSync,
    )) {
      addError(`${path}: ${violation}`);
    }
  }
}

validateContextMap();
validateSkill('.agents/skills/new-module/SKILL.md');
validateSkill('.agents/skills/review-module/SKILL.md');
validateDiff();
validateNeutralWording();
validateSymlinks();
validateMarkdownLinks();

if (errors.length) {
  console.error(`Agent repository check FAILED (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Agent repository check: PASS');
