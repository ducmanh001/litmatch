import assert from 'node:assert/strict';
import test from 'node:test';

import { findBrokenMarkdownLinks } from './markdown-links.mjs';

test('markdown link checker cho phép relative target tồn tại và bỏ qua external/anchor', () => {
  const existing = new Set(['/repo/docs/target.md']);
  assert.deepEqual(
    findBrokenMarkdownLinks(
      '/repo/docs/source.md',
      '[ok](./target.md#x) [anchor](#local) [web](https://example.com)',
      (path) => existing.has(path),
    ),
    [],
  );
});

test('markdown link checker báo target thiếu kèm line', () => {
  assert.deepEqual(
    findBrokenMarkdownLinks(
      '/repo/docs/source.md',
      'dòng 1\n[missing](./missing.md)',
      () => false,
    ),
    ['Markdown link hỏng dòng 2: ./missing.md'],
  );
});
