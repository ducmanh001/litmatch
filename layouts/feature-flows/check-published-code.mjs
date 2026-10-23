import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { currentAI_PATHS } from './generate-ai.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const base = 'https://ducmanh001.github.io/litmatch-feature-flows/';
const revision = process.argv.find((a) => a.startsWith('--commit='))?.slice(9);
const outputDir = path.resolve(
  here,
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
    'review/round14',
);
const bundle = JSON.parse(
  readFileSync(path.join(here, 'ai/flows.json'), 'utf8'),
);
const files = ['code/index.html', 'code/README.md', ...currentAI_PATHS(bundle)];
for (const catalog of readdirSync(here).filter(
  (f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs',
)) {
  for (const feature of (
    await import(pathToFileURL(path.join(here, catalog)).href)
  ).annotatedFeatures) {
    files.push(`code/${feature.id}/index.html`, `code/${feature.id}/README.md`);
    for (const ep of feature.endpoints)
      for (const ext of ['ts', 'html'])
        files.push(`code/${feature.id}/${ep.n}-${ep.slug}.${ext}`);
  }
}
assert.deepEqual(
  [...new Set([base, ...files.map((file) => new URL(file, base).href)])].sort(),
  bundle.inventory.urls,
  'Every inventory URL must be checked',
);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const results = [];
let next = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    while (next < files.length) {
      const file = files[next++];
      const url = new URL(file, base);
      if (revision) url.searchParams.set('v', revision);
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { 'Cache-Control': 'no-cache' },
        });
        const content = Buffer.from(await response.arrayBuffer());
        const expected = hash(readFileSync(path.join(here, file)));
        results.push({
          file,
          url: new URL(file, base).href,
          status: response.status,
          matches: response.ok && hash(content) === expected,
        });
      } catch (error) {
        results.push({
          file,
          url: new URL(file, base).href,
          error: error.message,
          matches: false,
        });
      }
    }
  }),
);
results.sort((a, b) => a.file.localeCompare(b.file));
const rootResponse = await fetch(base + (revision ? `?v=${revision}` : ''), {
  signal: AbortSignal.timeout(30_000),
});
const rootBytes = Buffer.from(await rootResponse.arrayBuffer());
const rootSha = createHash('sha1')
  .update(Buffer.from(`blob ${rootBytes.length}\0`))
  .update(rootBytes)
  .digest('hex');
results.push({
  file: 'index.html',
  url: base,
  status: rootResponse.status,
  matches:
    rootResponse.ok && rootSha === '4a511733b8680d4a14abc49fb9e743e22d1244ba',
});
writeFileSync(
  path.join(outputDir, 'published-check.json'),
  JSON.stringify({ revision, results }, null, 2) + '\n',
);
const failures = results.filter((r) => !r.matches);
for (const result of failures)
  console.error(
    `${result.file}: status=${result.status ?? result.error}; content differs from local output`,
  );
console.log(
  `${results.length - failures.length}/${results.length} published URLs: HTTP OK and exact content match.`,
);
if (failures.length) process.exitCode = 1;
