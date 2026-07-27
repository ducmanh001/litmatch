import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  validateArazzoDocument,
  validateAsyncApiDocument,
  validateDocx,
  validateRegistry,
  verifyVendoredArazzoSchema,
} from './generate.mjs';

const root = resolve(import.meta.dirname, '../..');

test('rejects malformed or schema-invalid Arazzo YAML', () => {
  assert.throws(
    () => validateArazzoDocument('arazzo: 1.1.0\ninfo: [\n'),
    /invalid YAML/,
  );
  assert.throws(
    () =>
      validateArazzoDocument(`
arazzo: 1.1.0
info:
  title: Missing workflows
  version: 1.0.0
sourceDescriptions:
  - name: core
    url: ../openapi/core-api.json
`),
    /official Arazzo schema/,
  );
});

test('rejects malformed AsyncAPI YAML through the official parser', async () => {
  await assert.rejects(
    () => validateAsyncApiDocument('asyncapi: 3.1.0\ninfo: [\n'),
    /official AsyncAPI parser/,
  );
});

test('rejects stale and corrupt DOCX artifacts', () => {
  const directory = mkdtempSync(join(tmpdir(), 'litmatch-docx-test-'));
  const staleDocx = join(directory, 'stale.docx');
  const corruptDocx = join(directory, 'corrupt.docx');
  try {
    copyFileSync(
      join(root, 'docs/generated/product-spec-evidence-report.docx'),
      staleDocx,
    );
    writeFileSync(corruptDocx, 'not-a-docx');
    assert.throws(() => validateDocx('# stale report\n', staleDocx), /stale/);
    assert.throws(
      () => validateDocx('# corrupt report\n', corruptDocx),
      /invalid/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('keeps deferred and out-of-scope work in dedicated registry sections', () => {
  const evidence = [{ path: 'README.md', contains: '#' }];
  assert.throws(
    () =>
      validateRegistry({
        schemaVersion: 1,
        features: [
          {
            id: 'wrong-status',
            title: 'Wrong status',
            status: 'deferred',
            owner: 'docs',
            contracts: ['README.md'],
            evidence,
            verification: { kind: 'source', evidence },
          },
        ],
        deferredDecisions: [],
        recordedChecks: [],
        moduleReviews: [],
        outOfScope: [],
      }),
    /unsupported status: deferred/,
  );
});

test('rejects an unreviewed vendored Arazzo schema change', () => {
  assert.throws(
    () => verifyVendoredArazzoSchema('{}\n'),
    /schema checksum mismatch/,
  );
});
