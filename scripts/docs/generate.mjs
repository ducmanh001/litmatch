#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Parser as AsyncApiParser, DiagnosticSeverity } from '@asyncapi/parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format } from 'prettier';
import { parseDocument } from 'yaml';

const root = resolve(import.meta.dirname, '../..');
const registryPath = join(root, 'docs/feature-registry.json');
const generatedMarkdownPath = join(
  root,
  'docs/generated/product-spec-evidence-report.md',
);
const generatedDocxPath = join(
  root,
  'docs/generated/product-spec-evidence-report.docx',
);
const arazzoSchemaPath = join(
  root,
  'scripts/docs/schemas/arazzo-1.1-2026-04-15.json',
);
const arazzoSchemaSha256 =
  '6b18a7f9b2cd56c71ad56f2fec2714befed831f1f96d664ba6296b14dc35ce90';
const allowedStatuses = new Set(['implemented']);
const fixedDate = new Date('1980-01-01T00:00:00.000Z');
const asyncApiParser = new AsyncApiParser();
const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});
addFormats(ajv);
const validateArazzoSchema = ajv.compile(
  verifyVendoredArazzoSchema(readFileSync(arazzoSchemaPath, 'utf8')),
);

function fail(message) {
  throw new Error(`[docs] ${message}`);
}

export function verifyVendoredArazzoSchema(source) {
  const actualSha256 = createHash('sha256').update(source).digest('hex');
  if (actualSha256 !== arazzoSchemaSha256) {
    fail(
      `vendored Arazzo schema checksum mismatch: expected ${arazzoSchemaSha256}, received ${actualSha256}`,
    );
  }
  return JSON.parse(source);
}

function readRegistry() {
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  } catch (error) {
    fail(`cannot parse docs/feature-registry.json: ${error.message}`);
  }

  if (registry.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (!Array.isArray(registry.features) || registry.features.length === 0) {
    fail('features must be a non-empty array');
  }
  if (!Array.isArray(registry.deferredDecisions)) {
    fail('deferredDecisions must be an array');
  }
  if (!Array.isArray(registry.recordedChecks)) {
    fail('recordedChecks must be an array');
  }
  if (!Array.isArray(registry.moduleReviews)) {
    fail('moduleReviews must be an array');
  }
  if (!Array.isArray(registry.outOfScope)) fail('outOfScope must be an array');
  return registry;
}

function assertEvidence(evidence, label) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    fail(`${label} requires at least one evidence item`);
  }

  for (const item of evidence) {
    if (
      !item ||
      typeof item.path !== 'string' ||
      typeof item.contains !== 'string'
    ) {
      fail(`${label} evidence must contain path and contains strings`);
    }
    if (item.path.startsWith('/') || item.path.includes('..')) {
      fail(`${label} evidence path must be repository-relative: ${item.path}`);
    }
    const absolutePath = join(root, item.path);
    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      fail(`${label} evidence file is missing: ${item.path}`);
    }
    if (!readFileSync(absolutePath, 'utf8').includes(item.contains)) {
      fail(
        `${label} evidence marker is missing from ${item.path}: ${item.contains}`,
      );
    }
  }
}

export function validateRegistry(registry) {
  const ids = new Set();
  for (const feature of registry.features) {
    if (
      !feature ||
      typeof feature.id !== 'string' ||
      !/^[a-z0-9-]+$/.test(feature.id)
    ) {
      fail('each feature id must use lowercase letters, digits, and hyphens');
    }
    if (ids.has(feature.id)) fail(`duplicate feature id: ${feature.id}`);
    ids.add(feature.id);
    for (const key of ['title', 'status', 'owner']) {
      if (typeof feature[key] !== 'string' || feature[key].trim() === '') {
        fail(`feature ${feature.id} requires ${key}`);
      }
    }
    if (!allowedStatuses.has(feature.status)) {
      fail(`feature ${feature.id} has unsupported status: ${feature.status}`);
    }
    if (!Array.isArray(feature.contracts) || feature.contracts.length === 0) {
      fail(`feature ${feature.id} requires contracts`);
    }
    for (const contract of feature.contracts) {
      if (typeof contract !== 'string' || !existsSync(join(root, contract))) {
        fail(`feature ${feature.id} references missing contract: ${contract}`);
      }
    }
    assertEvidence(feature.evidence, `feature ${feature.id}`);
    if (
      !feature.verification ||
      typeof feature.verification.kind !== 'string'
    ) {
      fail(`feature ${feature.id} requires verification.kind`);
    }
    assertEvidence(
      feature.verification.evidence,
      `feature ${feature.id} verification`,
    );
  }

  for (const decision of registry.deferredDecisions) {
    if (
      !decision ||
      decision.status !== 'deferred' ||
      typeof decision.reason !== 'string'
    ) {
      fail('each deferred decision needs status=deferred and reason');
    }
    assertEvidence(decision.evidence, `deferred decision ${decision.id}`);
  }
  for (const check of registry.recordedChecks) {
    if (
      !check ||
      typeof check.scope !== 'string' ||
      typeof check.result !== 'string' ||
      typeof check.command !== 'string' ||
      typeof check.caveat !== 'string'
    ) {
      fail('each recorded check needs scope, result, command, and caveat');
    }
    assertEvidence(check.evidence, `recorded check ${check.scope}`);
  }
  for (const item of registry.outOfScope) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.reason !== 'string'
    ) {
      fail('each out-of-scope item needs id and reason');
    }
  }
  const recordedCheckScopes = new Set(
    registry.recordedChecks.map((check) => check.scope),
  );
  for (const review of registry.moduleReviews) {
    if (
      !review ||
      typeof review.scope !== 'string' ||
      review.mode !== 'verify' ||
      typeof review.reviewedAt !== 'string' ||
      !['PASS', 'FAIL'].includes(review.result) ||
      typeof review.flow !== 'string' ||
      !Array.isArray(review.assumptions) ||
      review.assumptions.length === 0 ||
      !Array.isArray(review.checklist) ||
      review.checklist.length === 0 ||
      !Array.isArray(review.recordedCheckScopes) ||
      review.recordedCheckScopes.length === 0
    ) {
      fail(
        'each module review needs scope, verify mode, date, result, flow, assumptions, checklist, and recorded checks',
      );
    }
    for (const assumption of review.assumptions) {
      if (
        typeof assumption.assumption !== 'string' ||
        typeof assumption.breakVector !== 'string' ||
        !['PASS', 'FAIL', 'PARTIAL'].includes(assumption.verdict)
      ) {
        fail(`module review ${review.scope} has an invalid assumption`);
      }
      assertEvidence(
        assumption.guard,
        `module review ${review.scope} assumption`,
      );
    }
    for (const checklistItem of review.checklist) {
      if (
        typeof checklistItem.item !== 'string' ||
        !['PASS', 'FAIL', 'N/A'].includes(checklistItem.result) ||
        typeof checklistItem.note !== 'string'
      ) {
        fail(`module review ${review.scope} has an invalid checklist item`);
      }
    }
    for (const scope of review.recordedCheckScopes) {
      if (!recordedCheckScopes.has(scope)) {
        fail(
          `module review ${review.scope} references unknown recorded check: ${scope}`,
        );
      }
    }
  }
}

export function validateArazzoDocument(source) {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    fail(
      `critical workflows contain invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`,
    );
  }
  const value = document.toJS();
  if (!validateArazzoSchema(value)) {
    fail(
      `critical workflows violate the official Arazzo schema: ${ajv.errorsText(validateArazzoSchema.errors, { separator: '; ' })}`,
    );
  }
  return value;
}

export async function validateAsyncApiDocument(source) {
  const { document, diagnostics } = await asyncApiParser.parse(source);
  const errors = diagnostics.filter(
    (diagnostic) => diagnostic.severity === DiagnosticSeverity.Error,
  );
  if (!document || errors.length > 0) {
    fail(
      `realtime contract violates the official AsyncAPI parser: ${errors.map((error) => error.message).join('; ') || 'document could not be parsed'}`,
    );
  }
  return document;
}

async function validateSpecifications() {
  const openapiPath = join(root, 'openapi/core-api.json');
  const arazzoPath = join(root, 'specs/critical-workflows.arazzo.yaml');
  const asyncapiPath = join(root, 'specs/realtime.asyncapi.yaml');
  const realtimeEventsPath = join(
    root,
    'libs/common-dtos/src/lib/realtime-events.ts',
  );
  const openapi = JSON.parse(readFileSync(openapiPath, 'utf8'));
  const arazzo = readFileSync(arazzoPath, 'utf8');
  const asyncapi = readFileSync(asyncapiPath, 'utf8');
  const realtimeSource = readFileSync(realtimeEventsPath, 'utf8');

  const arazzoDocument = validateArazzoDocument(arazzo);
  if (arazzoDocument.arazzo !== '1.1.0') {
    fail('critical workflows must declare Arazzo 1.1.0');
  }
  const operationPaths = [
    ...arazzo.matchAll(
      /operationPath: \$sourceDescriptions\.core-api\.paths\.(\/[^\s]+)\.(get|post|patch|delete)/g,
    ),
  ];
  if (operationPaths.length === 0)
    fail('critical workflows need at least one operationPath');
  for (const [, operationPath, method] of operationPaths) {
    if (!openapi.paths?.[operationPath]?.[method]) {
      fail(
        `Arazzo references missing OpenAPI operation: ${method.toUpperCase()} ${operationPath}`,
      );
    }
  }

  const asyncApiDocument = await validateAsyncApiDocument(asyncapi);
  if (asyncApiDocument.version() !== '3.1.0') {
    fail('realtime contract must declare AsyncAPI 3.1.0');
  }
  const realtimeBlock = realtimeSource
    .split('export const RealtimeEvents = {')[1]
    ?.split('} as const;')[0];
  if (!realtimeBlock) fail('cannot locate RealtimeEvents source block');
  const sourceEventNames = new Set(
    [...realtimeBlock.matchAll(/:\s*'([a-z.]+)'/g)].map((match) => match[1]),
  );
  const asyncEventNames = [...asyncapi.matchAll(/^\s+name: ([a-z.]+)$/gm)].map(
    (match) => match[1],
  );
  if (asyncEventNames.length === 0)
    fail('realtime contract needs at least one event name');
  for (const eventName of asyncEventNames) {
    if (!sourceEventNames.has(eventName)) {
      fail(`AsyncAPI references unknown realtime event: ${eventName}`);
    }
  }
}

function tableRow(values) {
  return `| ${values.map((value) => String(value).replaceAll('|', '\\|')).join(' | ')} |`;
}

function evidenceLocation(item) {
  const source = readFileSync(join(root, item.path), 'utf8');
  const offset = source.indexOf(item.contains);
  const line = source.slice(0, offset).split('\n').length;
  return `${item.path}:${line}`;
}

function evidenceList(evidence) {
  return evidence
    .map(
      (item) => `\`${evidenceLocation(item)}\` — contains \`${item.contains}\``,
    )
    .join('; ');
}

function buildReport(registry) {
  const implemented = registry.features.filter(
    (feature) => feature.status === 'implemented',
  );
  const lines = [
    '# Product/spec evidence report',
    '',
    '> Generated from [`docs/feature-registry.json`](../feature-registry.json). Do not hand-edit this file; run `pnpm docs:generate`.',
    '',
    'This report distinguishes source-backed implementation evidence from production verification. An `implemented` status proves only that the registry markers exist in this checkout. `automated-test-source` proves a relevant test source exists. Recorded targeted checks preserve supplied handoff results with caveats and do not prove production behavior.',
    '',
    '## 1. Cost-first automation',
    '',
    'The registry is structured JSON and the generator performs local path/marker checks. This replaces a manually maintained or AI-maintained status inventory with a deterministic repository check. Validation is offline: the Arazzo 1.1 schema is vendored from the OpenAPI Initiative and AsyncAPI uses its official parser; no hosted validation service is called.',
    '',
    '## 2. Consolidation and canonical ownership',
    '',
    'Current-status prose is consolidated in the registry. Product intent, architecture, and domain specifications remain separate because they answer different questions. The README links to this report instead of duplicating a stage snapshot. No domain specification was deleted without a clearly redundant replacement.',
    '',
    '## 3. Algorithm, database-query, and cache decisions',
    '',
    '- Existing, source-backed decisions remain in their owning specifications: Economy uses an append-only double-entry ledger; matching uses ticket workers; short-video ranking is derived with a recent-sort fallback; realtime is best-effort with REST fallback.',
    '- No cache policy, query rewrite, CQRS split, or algorithm upgrade is claimed here without production measurements. The deferred items below name the missing evidence and owner.',
    '',
    '## 4. Structure standardization',
    '',
    'The canonical Nest rule is semantic: `<module>.controller.ts` is the primary HTTP facade, secondary HTTP resources belong in `controllers/`, and third-party inbound controllers remain in `webhooks/`. The matching invite and feed story controllers were moved to `controllers/`, and an architecture test now enforces this layout. [16-module-blueprint.md](../16-module-blueprint.md), [05-coding-standards.md](../05-coding-standards.md), and [11-engineering-principles.md](../11-engineering-principles.md) remain the structure rules.',
    '',
    '## 5. Synchronized artifacts',
    '',
    '- Feature inventory: `docs/feature-registry.json` (canonical machine-readable source).',
    '- Reader report and DOCX: generated by `scripts/docs/generate.mjs`.',
    '- Critical REST workflows: [`specs/critical-workflows.arazzo.yaml`](../../specs/critical-workflows.arazzo.yaml), sourced from `openapi/core-api.json`.',
    '- Realtime boundary: [`specs/realtime.asyncapi.yaml`](../../specs/realtime.asyncapi.yaml), sourced from `libs/common-dtos/src/lib/realtime-events.ts`.',
    '- GitHub CI/CD: explicitly out of scope for this change.',
    '',
    '## Implemented features (source-backed)',
    '',
    tableRow(['ID', 'Feature', 'Owner', 'Verification evidence']),
    tableRow(['---', '---', '---', '---']),
    ...implemented.map((feature) =>
      tableRow([
        feature.id,
        feature.title,
        feature.owner,
        feature.verification.kind,
      ]),
    ),
    '',
    '## Evidence details',
    '',
  ];

  for (const feature of implemented) {
    lines.push(`### ${feature.title}`);
    lines.push('');
    lines.push(`- Status: \`${feature.status}\``);
    lines.push(`- Owner: ${feature.owner}`);
    lines.push(
      `- Contracts: ${feature.contracts.map((contract) => `\`${contract}\``).join(', ')}`,
    );
    lines.push(`- Implementation evidence: ${evidenceList(feature.evidence)}`);
    lines.push(
      `- Verification evidence (${feature.verification.kind}): ${evidenceList(feature.verification.evidence)}`,
    );
    lines.push('');
  }

  lines.push('## Recorded targeted checks');
  lines.push('');
  for (const check of registry.recordedChecks) {
    lines.push(`### ${check.scope}`);
    lines.push('');
    lines.push(`- Result: ${check.result}`);
    lines.push(`- Command: \`${check.command}\``);
    lines.push(`- Source evidence: ${evidenceList(check.evidence)}`);
    lines.push(`- Caveat: ${check.caveat}`);
    lines.push('');
  }

  lines.push('## Review-module verification');
  lines.push('');
  for (const review of registry.moduleReviews) {
    lines.push(
      `### ${review.scope} — ${review.mode} — ${review.reviewedAt} — ${review.result}`,
    );
    lines.push('');
    lines.push(`- Business flow: ${review.flow}`);
    lines.push('');
    lines.push(
      tableRow([
        '#',
        'Assumption',
        'Break vector / consequence',
        'Guard location',
        'Verdict',
      ]),
    );
    lines.push(tableRow(['---', '---', '---', '---', '---']));
    review.assumptions.forEach((assumption, index) => {
      lines.push(
        tableRow([
          index + 1,
          assumption.assumption,
          assumption.breakVector,
          evidenceList(assumption.guard),
          assumption.verdict,
        ]),
      );
    });
    lines.push('');
    lines.push('Checklist:');
    for (const item of review.checklist) {
      lines.push(`- ${item.result} — ${item.item}: ${item.note}`);
    }
    lines.push('');
    lines.push(
      `Test evidence: ${review.recordedCheckScopes.join('; ')} (see recorded checks above).`,
    );
    lines.push('');
  }

  lines.push('## Deferred with reason');
  lines.push('');
  for (const decision of registry.deferredDecisions) {
    lines.push(`### ${decision.id}`);
    lines.push('');
    lines.push(`- Owner: ${decision.owner}`);
    lines.push(`- Reason: ${decision.reason}`);
    lines.push(`- Evidence: ${evidenceList(decision.evidence)}`);
    lines.push('');
  }

  lines.push('## Out of scope');
  lines.push('');
  for (const item of registry.outOfScope) {
    lines.push(`- **${item.id}** — ${item.reason}`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function paragraph(text, style) {
  const properties = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${properties}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxParagraphs(markdown) {
  return markdown
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      if (line.startsWith('# ')) return paragraph(line.slice(2), 'Title');
      if (line.startsWith('## ')) return paragraph(line.slice(3), 'Heading1');
      if (line.startsWith('### ')) return paragraph(line.slice(4), 'Heading2');
      return paragraph(line.replaceAll('`', ''));
    })
    .join('');
}

function docxFiles(report) {
  return new Map([
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>',
    ],
    [
      'docProps/core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Litmatch Product/Spec Evidence Report</dc:title><dc:creator>Litmatch documentation generator</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">1980-01-01T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">1980-01-01T00:00:00Z</dcterms:modified></cp:coreProperties>',
    ],
    [
      'docProps/app.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Litmatch documentation generator</Application></Properties>',
    ],
    [
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${docxParagraphs(report)}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`,
    ],
  ]);
}

function writeDocx(report) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'litmatch-docs-'));
  const wordDirectory = join(temporaryDirectory, 'word');
  const relsDirectory = join(temporaryDirectory, '_rels');
  const propsDirectory = join(temporaryDirectory, 'docProps');
  mkdirSync(wordDirectory, { recursive: true });
  mkdirSync(relsDirectory, { recursive: true });
  mkdirSync(propsDirectory, { recursive: true });

  const files = docxFiles(report);

  for (const [relativePath, content] of files) {
    const absolutePath = join(temporaryDirectory, relativePath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content);
    utimesSync(absolutePath, fixedDate, fixedDate);
  }

  const temporaryOutput = join(temporaryDirectory, 'report.docx');
  try {
    execFileSync('zip', ['-X', '-D', '-q', temporaryOutput, ...files.keys()], {
      cwd: temporaryDirectory,
      stdio: 'pipe',
    });
  } catch (error) {
    fail(`DOCX generation requires the local zip command: ${error.message}`);
  }
  mkdirSync(dirname(generatedDocxPath), { recursive: true });
  rmSync(generatedDocxPath, { force: true });
  renameSync(temporaryOutput, generatedDocxPath);
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

export function validateDocx(report, docxPath = generatedDocxPath) {
  if (!existsSync(docxPath) || statSync(docxPath).size === 0) {
    fail('generated DOCX is missing; run pnpm docs:generate');
  }

  const expectedFiles = docxFiles(report);
  let archiveEntries;
  try {
    execFileSync('unzip', ['-tq', docxPath], { stdio: 'pipe' });
    archiveEntries = execFileSync('unzip', ['-Z1', docxPath], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .sort();
  } catch (error) {
    fail(`generated DOCX is invalid: ${error.message}`);
  }
  const expectedEntries = [...expectedFiles.keys()].sort();
  if (JSON.stringify(archiveEntries) !== JSON.stringify(expectedEntries)) {
    fail('generated DOCX structure is stale; run pnpm docs:generate');
  }
  for (const [entry, expectedContent] of expectedFiles) {
    const archivePattern = entry
      .replaceAll('[', String.raw`\[`)
      .replaceAll(']', String.raw`\]`);
    const actualContent = execFileSync(
      'unzip',
      ['-p', docxPath, archivePattern],
      {
        encoding: 'utf8',
      },
    );
    if (actualContent !== expectedContent) {
      fail(`generated DOCX entry is stale (${entry}); run pnpm docs:generate`);
    }
  }
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  if (
    process.argv.length > 3 ||
    (process.argv[2] && process.argv[2] !== '--check')
  ) {
    fail('usage: node scripts/docs/generate.mjs [--check]');
  }
  const registry = readRegistry();
  validateRegistry(registry);
  await validateSpecifications();
  const report = await format(buildReport(registry), { parser: 'markdown' });

  if (checkOnly) {
    if (!existsSync(generatedMarkdownPath))
      fail('generated Markdown is missing; run pnpm docs:generate');
    if (readFileSync(generatedMarkdownPath, 'utf8') !== report) {
      fail('generated Markdown is stale; run pnpm docs:generate');
    }
    validateDocx(report);
    console.log('[docs] registry and generated artifacts are valid');
    return;
  }

  mkdirSync(dirname(generatedMarkdownPath), { recursive: true });
  writeFileSync(generatedMarkdownPath, report);
  writeDocx(report);
  console.log(
    `[docs] generated ${relative(root, generatedMarkdownPath)} and ${relative(root, generatedDocxPath)}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
