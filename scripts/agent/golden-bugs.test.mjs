import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadGoldenBugs } from './golden-bugs.mjs';

const docsPath = fileURLToPath(
  new URL('../../docs/10-code-review-checklist.md', import.meta.url),
);

test('mọi fixture parse được và đủ field bắt buộc', () => {
  const bugs = loadGoldenBugs();
  assert.ok(bugs.length > 0, 'phải có ít nhất 1 fixture');
});

test('id không trùng nhau giữa các fixture', () => {
  const ids = loadGoldenBugs().map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'có id bị trùng');
});

test('mỗi docsRef còn khớp nguyên văn 1 chỗ trong docs/10-code-review-checklist.md', () => {
  const docsContent = readFileSync(docsPath, 'utf8');
  for (const bug of loadGoldenBugs()) {
    assert.ok(
      docsContent.includes(bug.docsRef),
      `${bug.file}: docsRef "${bug.docsRef}" không còn khớp câu nào trong docs/10 — ` +
        `docs/10 đã đổi wording, cập nhật lại docsRef của fixture này cho khớp bản mới`,
    );
  }
});

test('Economy, Matching và Frontend (đã có code thật) đều có fixture', () => {
  const modules = new Set(loadGoldenBugs().map((b) => b.module));
  assert.ok(modules.has('economy'), 'thiếu fixture cho economy');
  assert.ok(modules.has('matching'), 'thiếu fixture cho matching');
  assert.ok(
    modules.has('frontend'),
    'thiếu fixture cho frontend (docs/10 § 10.2 Frontend)',
  );
});

test('mỗi fixture module chỉ nhận giá trị đã biết (tránh gõ nhầm tên module)', () => {
  const KNOWN_MODULES = new Set([
    'economy',
    'matching',
    'calling',
    'party-room',
    'feed',
    'gift',
    'avatar',
    'trust-safety',
    'frontend',
  ]);
  for (const bug of loadGoldenBugs()) {
    assert.ok(
      KNOWN_MODULES.has(bug.module),
      `${bug.file}: module "${bug.module}" không nằm trong danh sách domain đã biết ở docs/10 § 10.2`,
    );
  }
});
