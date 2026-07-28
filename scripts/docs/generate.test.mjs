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
  renderDocxParagraphs,
  parseDocsArguments,
  docxFiles,
} from './generate.mjs';

const root = resolve(import.meta.dirname, '../..');

test('accepts DOCX-only recovery but rejects DOCX-only validation', () => {
  assert.deepEqual(parseDocsArguments([]), {
    checkOnly: false,
    docxOnly: false,
  });
  assert.deepEqual(parseDocsArguments(['--check']), {
    checkOnly: true,
    docxOnly: false,
  });
  assert.deepEqual(parseDocsArguments(['--docx-only']), {
    checkOnly: false,
    docxOnly: true,
  });
  assert.throws(
    () => parseDocsArguments(['--check', '--docx-only']),
    /cannot be combined/,
  );
});

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

test('renders handbook blocks without raw syntax, soft-wrap breaks, or table separators', () => {
  const documentXml = renderDocxParagraphs(`
[← Lifecycle](./19.md) · **20 · Handbook** · [Overview](./00.md)
# Handbook [home](https://example.test)
> A short \`quote\`
- First \`item\`
  continued on the next source line
1. Second **item**
Soft-wrapped **bold
span** stays in one paragraph.
\`\`\`ts
const answer = 42;
\`\`\`
| Trend | Decision |
| --- | --- |
| Stable | Keep [source](./docs.md) |
---
`);

  assert.match(documentXml, /Handbook home \(https:\/\/example\.test\)/);
  assert.match(documentXml, /A short quote/);
  assert.match(documentXml, /• First item continued on the next source line/);
  assert.match(documentXml, /1\. Second item/);
  assert.match(documentXml, /Soft-wrapped bold span stays in one paragraph\./);
  assert.match(documentXml, /const answer = 42;/);
  assert.match(
    documentXml,
    /w:pStyle w:val="TableCardTitle"[^>]*><\/w:pPr><w:r><w:t[^>]*>Stable/,
  );
  assert.match(documentXml, /Decision: Keep source \(\.\/docs\.md\)/);
  assert.doesNotMatch(documentXml, /\| --- \|/);
  assert.doesNotMatch(documentXml, /Lifecycle/);
  assert.doesNotMatch(documentXml, /\*\*bold/);
  assert.doesNotMatch(documentXml, /<w:t[^>]*>```/);
});

test('packages deterministic styles for readable DOCX output', () => {
  const files = docxFiles('# Title\n', 'Test title');
  assert.match(files.get('[Content_Types].xml'), /\/word\/styles\.xml/);
  assert.match(
    files.get('word/_rels/document.xml.rels'),
    /relationships\/styles/,
  );
  assert.match(files.get('word/styles.xml'), /w:styleId="TableCell"/);
  assert.match(files.get('word/styles.xml'), /w:styleId="Heading3"/);
  assert.match(files.get('word/document.xml'), /w:w="11906" w:h="16838"/);
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
