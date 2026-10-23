import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertLocalUrl, parseBenchArgs } from './bench/common.mjs';

test('benchmark từ chối mọi Postgres không phải cục bộ (script DROP DATABASE và nạp hàng triệu hàng)', () => {
  for (const host of ['127.0.0.1', 'localhost']) {
    assert.doesNotThrow(() => assertLocalUrl(`postgres://u:p@${host}:5432`));
  }
  for (const host of [
    'db.internal.example.com',
    '10.0.0.5',
    'prod-primary.cluster-abc.us-east-1.rds.amazonaws.com',
  ]) {
    assert.throws(
      () => assertLocalUrl(`postgres://u:p@${host}:5432`),
      /cục bộ/u,
      host,
    );
  }
});

test('parseBenchArgs: mặc định, ép kiểu số, từ chối tham số lạ hoặc thiếu giá trị', () => {
  const defaults = { rows: 100, batch: 10 };
  const parsed = parseBenchArgs(
    ['--rows=5000', '--template=litmatch_e2e'],
    defaults,
  );
  assert.equal(parsed.rows, 5000);
  assert.equal(parsed.batch, 10);
  assert.equal(parsed.template, 'litmatch_e2e');
  assert.match(parsed.url, /127\.0\.0\.1/u);

  assert.throws(
    () => parseBenchArgs(['--khong-biet=1'], defaults),
    /không biết/u,
  );
  assert.throws(() => parseBenchArgs(['--rows'], defaults), /Thiếu giá trị/u);
  assert.throws(
    () => parseBenchArgs(['--rows=abc'], defaults),
    /không phải số/u,
  );
  assert.throws(() => parseBenchArgs(['rows=1'], defaults), /không hợp lệ/u);
});

test('guard không bị vượt qua bằng ?host= (driver pg dùng tham số này thay hostname của URL)', () => {
  for (const url of [
    'postgres://u:p@127.0.0.1:55432/postgres?host=prod.example.com',
    'postgres://u:p@localhost/postgres?hostaddr=10.0.0.5',
    'postgres://u:p@127.0.0.1/postgres?sslmode=disable',
  ]) {
    assert.throws(() => assertLocalUrl(url), /query string/u, url);
    assert.throws(() => parseBenchArgs([`--url=${url}`], {}), /query string/u);
  }
});

test('parseBenchArgs: url từ xa và tên DB mẫu có ký tự lạ bị từ chối trước khi chạm DB', () => {
  assert.throws(
    () => parseBenchArgs(['--url=postgres://u:p@prod.example.com:5432'], {}),
    /cục bộ/u,
  );
  assert.throws(
    () => parseBenchArgs(['--template=x; DROP DATABASE postgres'], {}),
    /DB mẫu không hợp lệ/u,
  );
});
