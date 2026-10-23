// review-module: N/A — generated documentation coverage, crawl links and publication safety.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AI_PATHS,
  SITE_URL,
  currentAI_PATHS,
  generateAi,
  parseSteps,
  safeRelativePath,
} from './generate-ai.mjs';
import {
  MAX_BATCH_BYTES,
  batchAdditions,
  commitInput,
  publicationAdditions,
  publishAi,
} from './publish-ai.mjs';
import { featureCatalog } from './feature-catalog.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const codePath = 'code/fixture/01-write.ts';

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'litmatch-ai-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(path.join(directory, 'code', 'fixture'), { recursive: true });
  const endpoint = {
    n: '01',
    slug: 'write',
    method: 'POST',
    route: '/fixture',
    name: 'Write',
    title: 'Write once',
    flow: '[SERVICE] → [POSTGRES]',
    roles: [['POSTGRES', 'Unique key']],
    tables: [['entries', 'Append-only']],
    redis: [['queue:{userId}', 'Ephemeral coordination']],
    related: [['Economy', 'Ledger writer']],
    nested: true,
    skip: ['simpleLookup'],
    attach: { 'Other.same': { nth: -1 } },
    steps: [
      {
        at: 'save()',
        text: 'Persist the complete operation including its continuation',
      },
    ],
    items: [
      {
        file: 'source.ts',
        tag: 'SERVICE',
        ranges: [{ at: 'save()', to: '^}' }],
        helpers: [{ file: 'helper.ts', at: 'function helper(' }],
        inline: [
          {
            at: 'save()',
            text: ['Avoid duplicates'],
            src: 'source.ts L1; stated inference',
          },
        ],
      },
    ],
  };
  writeFileSync(
    path.join(directory, 'annotated-fixture.mjs'),
    `export const annotatedFeatures = ${JSON.stringify([{ id: 'fixture', title: 'Fixture', summary: 'Test evidence', endpoints: [endpoint] }])};`,
  );
  const code =
    '//  Step 1: Persist the complete operation including its continuation\n\n  // Step 1: Persist the complete operation\n  // including its continuation\n  save();\n';
  writeFileSync(path.join(directory, codePath), code);
  writeFileSync(
    path.join(directory, codePath.replace(/\.ts$/u, '.sources.json')),
    JSON.stringify({
      codeSha256: digest(code),
      sourceCommit: 'c'.repeat(40),
      sources: ['source.ts', 'resolved-adapter.ts'],
      steps: [
        'Step 1: Persist the complete operation including its continuation',
      ],
    }),
  );
  return { directory, endpoint, code };
}

test('preserves complete flow metadata, exact code/evidence and catalog selection', async (t) => {
  const { directory, endpoint, code } = fixture(t);
  const result = await generateAi({ sourceDir: directory });
  const flow = result.flows[0];
  assert.deepEqual(flow.endpointCatalog, endpoint);
  assert.deepEqual(flow.roles, endpoint.roles);
  assert.deepEqual(flow.tables, endpoint.tables);
  assert.deepEqual(flow.redis, endpoint.redis);
  assert.deepEqual(flow.related, endpoint.related);
  assert.equal(flow.whyComments[0].src, endpoint.items[0].inline[0].src);
  assert.deepEqual(flow.sourceContext.items, endpoint.items);
  assert.deepEqual(flow.sourceContext.skip, endpoint.skip);
  assert.deepEqual(flow.sourceContext.attach, endpoint.attach);
  assert.ok(
    flow.sourceContext.helpers.some((helper) => helper.file === 'helper.ts'),
  );
  assert.deepEqual(flow.sources, [
    'helper.ts',
    'resolved-adapter.ts',
    'source.ts',
  ]);
  assert.equal(flow.sourceManifest.sourceCommit, 'c'.repeat(40));
  assert.equal(flow.code.content, code);
  assert.equal(flow.code.sha256, digest(code));
  assert.equal(flow.steps[0].line, 3);
  assert.equal(flow.steps[0].text, endpoint.steps[0].text);
  assert.ok(flow.steps[0].htmlUrl.endsWith('.html#L3'));
  assert.ok(flow.steps[0].rawLineUrl.endsWith('.ts#L3'));
  const chunk = JSON.parse(
    readFileSync(
      path.join(directory, 'ai/flows/fixture/01-write.json'),
      'utf8',
    ),
  );
  assert.deepEqual(chunk, flow);
  const full = readFileSync(path.join(directory, 'llms-full.txt'), 'utf8');
  assert.ok(full.includes(code.trimEnd()));
  assert.ok(full.includes(endpoint.items[0].inline[0].src));
  assert.ok(full.includes(flow.steps[0].text));
  await generateAi({ sourceDir: directory, check: true });
  assert.deepEqual(await generateAi({ sourceDir: directory }), result);
});

test('all diagram catalog fields, branch conditions and renderer graph survive in chunks', async (t) => {
  const { directory } = fixture(t);
  const result = await generateAi({ sourceDir: directory });
  assert.equal(result.diagrams.length, 25);
  const soul = result.diagrams.find(
    (diagram) => diagram.id === '02-soul-match',
  );
  assert.deepEqual(
    soul.feature,
    featureCatalog.find((feature) => feature.id === soul.id),
  );
  assert.ok(soul.featureSequence.some((line) => line.includes('MUTUAL-LIKE')));
  assert.ok(
    soul.featureSequence.some((line) => line.includes('continues=false')),
  );
  assert.ok(
    soul.layerSequence.some((line) => line.includes('signaling-gateway')),
  );
  assert.ok(
    soul.architecture.components.some(
      (component) => component.id === 'postgres',
    ),
  );
  assert.ok(
    soul.architecture.edges.some(
      (edge) =>
        edge.from === 'redis' &&
        edge.to === 'gateway' &&
        edge.protocol === 'realtime Pub/Sub',
    ),
  );
  const chunk = JSON.parse(
    readFileSync(path.join(directory, `ai/diagrams/${soul.id}.json`), 'utf8'),
  );
  assert.deepEqual(chunk, soul);
});

test('static crawl index links every flow and diagram chunk and sitemap covers its inventory', async (t) => {
  const { directory } = fixture(t);
  const result = await generateAi({ sourceDir: directory });
  assert.deepEqual(result.inventory.paths, currentAI_PATHS(result));
  for (const relative of result.inventory.paths)
    assert.ok(existsSync(path.join(directory, relative)), relative);
  const html = readFileSync(path.join(directory, 'ai/index.html'), 'utf8');
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  const hrefs = [...html.matchAll(/href="([^"]+)"/gu)].map((match) => match[1]);
  for (const item of [...result.flows, ...result.diagrams])
    assert.ok(hrefs.includes(item.chunkUrl), item.chunkUrl);
  for (const href of hrefs) {
    const target = new URL(href, `${SITE_URL}ai/index.html`);
    if (href.startsWith('#'))
      assert.ok(html.includes(`id="${target.hash.slice(1)}"`), href);
    if (target.href.startsWith(`${SITE_URL}ai/`) && !target.hash)
      assert.ok(
        existsSync(
          path.join(
            directory,
            target.pathname.slice(new URL(SITE_URL).pathname.length),
          ),
        ),
        href,
      );
  }
  const sitemap = readFileSync(path.join(directory, 'sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(locations, result.inventory.urls);
  assert.equal(new Set(locations).size, locations.length);
  assert.ok(locations.includes(result.flows[0].rawUrl));
  assert.ok(locations.includes(result.flows[0].htmlUrl));
  assert.ok(
    result.inventory.paths.every((relative) =>
      locations.includes(`${SITE_URL}${relative}`),
    ),
  );
  const index = JSON.parse(
    readFileSync(path.join(directory, 'ai/index.json'), 'utf8'),
  );
  assert.deepEqual(index.flows[0].steps, result.flows[0].steps);
  assert.equal(index.diagrams.length, result.diagrams.length);
  assert.ok(
    AI_PATHS.every((relative) =>
      index.resources.some((resource) => resource.path === relative),
    ),
  );
});

test('code/manifest/output drift, malformed Steps and missing HTML anchors fail closed', async (t) => {
  const { directory, code } = fixture(t);
  await generateAi({ sourceDir: directory });
  writeFileSync(path.join(directory, 'llms.txt'), 'stale');
  await assert.rejects(
    generateAi({ sourceDir: directory, check: true }),
    /Stale llms.txt/u,
  );
  writeFileSync(path.join(directory, codePath), `${code}changed();\n`);
  await assert.rejects(
    generateAi({ sourceDir: directory }),
    /Stale source manifest/u,
  );
  rmSync(path.join(directory, codePath.replace(/\.ts$/u, '.sources.json')));
  writeFileSync(path.join(directory, codePath), '// Step 2: Persist\n');
  await assert.rejects(
    generateAi({ sourceDir: directory }),
    /nonsequential Steps/u,
  );
  writeFileSync(path.join(directory, codePath), code);
  writeFileSync(
    path.join(directory, codePath.replace(/\.ts$/u, '.html')),
    '<div id="L1">Wrong line</div>',
  );
  await assert.rejects(
    generateAi({ sourceDir: directory }),
    /Missing HTML Step anchor/u,
  );
  rmSync(path.join(directory, codePath));
  await assert.rejects(generateAi({ sourceDir: directory }), /ENOENT/u);
});

test('unverified legacy sidecars are ignored rather than importing expanded-round context', async (t) => {
  const { directory } = fixture(t);
  writeFileSync(
    path.join(directory, codePath.replace(/\.ts$/u, '.sources.json')),
    JSON.stringify({ sources: ['obsolete-round14.ts'], steps: ['Wrong Step'] }),
  );
  const result = await generateAi({ sourceDir: directory });
  assert.ok(!result.flows[0].sources.includes('obsolete-round14.ts'));
  assert.equal(result.flows[0].sourceManifest.verifiedCodeSha256, false);
  assert.deepEqual(
    parseSteps('// Step N: guide\nconst text = "Step 1: ignored";'),
    [],
  );
  assert.throws(
    () => parseSteps('//  Step 1: A\n//  Step 1: B'),
    /Duplicate summary/u,
  );
});

test('publication defaults to offline dry-run with exactly the generated AI paths', async (t) => {
  const { directory } = fixture(t);
  const generated = await generateAi({ sourceDir: directory });
  const result = await publishAi({
    sourceDir: directory,
    gh: () => assert.fail('Dry run called GitHub'),
  });
  assert.equal(result.pushed, false);
  assert.deepEqual(result.paths, currentAI_PATHS(generated));
  assert.ok(result.batchCount >= 1);
  const additions = publicationAdditions(directory);
  const input = commitInput(additions, 'a'.repeat(40));
  assert.deepEqual(Object.keys(input.fileChanges), ['additions']);
  assert.equal(
    input.branch.repositoryNameWithOwner,
    'ducmanh001/litmatch-feature-flows',
  );
  assert.ok(!JSON.stringify(input.message).includes('Co-Authored-By'));
  for (const invalid of [
    'index.html',
    'code/index.html',
    '../llms.txt',
    'ai/private.txt',
    'ai/flows.json/../../index.html',
  ]) {
    assert.throws(() =>
      publicationAdditions(directory, [invalid, ...result.paths.slice(1)]),
    );
    assert.throws(() =>
      commitInput([{ path: invalid, contents: '' }], 'a'.repeat(40)),
    );
  }
  assert.throws(() =>
    commitInput([additions[0], additions[0]], 'a'.repeat(40)),
  );
  assert.throws(() => commitInput([additions[0]], 'invalid'));
});

test('path traversal and junctions cannot escape publication source scope', async (t) => {
  const { directory } = fixture(t);
  await generateAi({ sourceDir: directory });
  for (const invalid of [
    '../index.html',
    '/index.html',
    'C:/index.html',
    'code\\index.html',
    'code/../index.html',
    './llms.txt',
    'code//file',
    'https://example.test/file',
    'file?query',
    '',
  ])
    assert.throws(() => safeRelativePath(invalid), /Unsafe/u);
  const outside = mkdtempSync(path.join(tmpdir(), 'litmatch-ai-outside-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const local = path.join(directory, 'ai/diagrams');
  cpSync(local, outside, { recursive: true });
  rmSync(local, { recursive: true });
  symlinkSync(
    outside,
    local,
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.throws(() => publicationAdditions(directory), /escapes root/u);
});

test('batched explicit push is additions-only, bounded and chains optimistic heads', async (t) => {
  const { directory } = fixture(t);
  const generated = await generateAi({ sourceDir: directory });
  const additions = publicationAdditions(directory);
  const limit =
    Math.max(
      ...additions.map((addition) =>
        Buffer.byteLength(JSON.stringify(addition)),
      ),
    ) + 4096;
  const batches = batchAdditions(additions, limit);
  assert.ok(batches.length > 1);
  let expectedHead = 'b'.repeat(40);
  let mutationCount = 0;
  const published = [];
  const gh = (args) => {
    if (args[1].startsWith('repos/')) return expectedHead;
    const body = readFileSync(args.at(-1), 'utf8');
    assert.ok(Buffer.byteLength(body) <= limit);
    const request = JSON.parse(body);
    assert.equal(request.variables.input.expectedHeadOid, expectedHead);
    assert.equal(request.variables.input.fileChanges.deletions, undefined);
    assert.deepEqual(Object.keys(request.variables.input.fileChanges), [
      'additions',
    ]);
    published.push(
      ...request.variables.input.fileChanges.additions.map(
        (addition) => addition.path,
      ),
    );
    expectedHead = (++mutationCount).toString(16).padStart(40, '0');
    return JSON.stringify({
      data: {
        createCommitOnBranch: {
          commit: {
            oid: expectedHead,
            url: `https://example.test/commit/${mutationCount}`,
          },
        },
      },
    });
  };
  const result = await publishAi({
    sourceDir: directory,
    push: true,
    maxBatchBytes: limit,
    gh,
  });
  assert.equal(result.pushed, true);
  assert.equal(result.commits.length, batches.length);
  assert.deepEqual(published.sort(), currentAI_PATHS(generated));
  assert.throws(
    () =>
      batchAdditions([
        { path: 'llms.txt', contents: 'x'.repeat(MAX_BATCH_BYTES) },
      ]),
    /exceeds batch limit/u,
  );
});
