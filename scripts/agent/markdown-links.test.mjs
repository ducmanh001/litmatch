import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import { findBrokenMarkdownLinks } from './markdown-links.mjs';

test('markdown link checker cho phép relative target tồn tại và bỏ qua external/anchor', () => {
  const source = resolve('repo/docs/source.md');
  const existing = new Set([resolve('repo/docs/target.md')]);
  assert.deepEqual(
    findBrokenMarkdownLinks(
      source,
      '[ok](./target.md#x) [anchor](#local) [web](https://example.com)',
      (path) => existing.has(path),
    ),
    [],
  );
});

test('markdown link checker báo target thiếu kèm line', () => {
  assert.deepEqual(
    findBrokenMarkdownLinks(
      resolve('repo/docs/source.md'),
      'dòng 1\n[missing](./missing.md)',
      () => false,
    ),
    ['Markdown link hỏng dòng 2: ./missing.md'],
  );
});
