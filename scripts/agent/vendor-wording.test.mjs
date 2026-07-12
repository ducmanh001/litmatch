import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findVendorNameViolations } from './vendor-wording.mjs';

test('phát hiện tên nền tảng dạng plain text', () => {
  const fixture = 'dòng 1\nDùng Claude cho việc này\ndòng 3'; // agent-check:allow-vendor-name — literal cố ý để test detection
  const violations = findVendorNameViolations(fixture);
  assert.deepEqual(violations, [2]);
});

test('không báo lỗi khi không có tên nền tảng', () => {
  assert.deepEqual(findVendorNameViolations('dùng agent để review module'), []);
});

test('escape hatch: marker cùng dòng thì bỏ qua', () => {
  const content =
    'Ghi chú vận hành: Codex có quirk X ở đây // agent-check:allow-vendor-name';
  assert.deepEqual(findVendorNameViolations(content), []);
});

test('escape hatch: marker dòng ngay trước thì bỏ qua', () => {
  const content =
    '<!-- agent-check:allow-vendor-name -->\nCodex xử lý timeout khác các agent khác';
  assert.deepEqual(findVendorNameViolations(content), []);
});

test('escape hatch không lan sang dòng không liền kề', () => {
  const content =
    '<!-- agent-check:allow-vendor-name -->\ndòng đệm\nCodex nhắc ở đây';
  assert.deepEqual(findVendorNameViolations(content), [3]);
});

test('tự-chặn: source của chính module này không chứa plaintext của từ bị cấm', () => {
  const selfPath = fileURLToPath(
    new URL('./vendor-wording.mjs', import.meta.url),
  );
  const source = readFileSync(selfPath, 'utf8');
  assert.deepEqual(
    findVendorNameViolations(source),
    [],
    'nếu test này fail, ai đó đã de-obfuscate BANNED_WORDS thành literal — đúng hành vi mong muốn (tự bắt được), sửa lại bằng codepoint',
  );
});
