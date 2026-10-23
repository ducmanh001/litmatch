// Presentation-only update of the approved published snapshot. No business body regeneration.
// review-module: N/A — generated documentation and crawl links only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_COMMIT = 'cb30743143bd8f6576b154db4b606380c365c674';
export const baselineDir = path.join(here, 'review/header-ai/baseline');
const escape = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const gitBlob = (s) =>
  createHash('sha1')
    .update(Buffer.from(`blob ${Buffer.byteLength(s)}\0`))
    .update(s)
    .digest('hex');

export async function catalogs() {
  const features = [];
  for (const name of readdirSync(here)
    .filter(
      (f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs',
    )
    .sort()) {
    features.push(
      ...(await import(pathToFileURL(path.join(here, name)).href))
        .annotatedFeatures,
    );
  }
  return features;
}

export async function fetchBaseline() {
  const tree = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        `repos/ducmanh001/litmatch-feature-flows/git/trees/${BASELINE_COMMIT}?recursive=1`,
      ],
      { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
    ),
  );
  assert.equal(tree.truncated, false, 'Baseline tree must be complete');
  const files = tree.tree.filter(
    (f) =>
      f.type === 'blob' &&
      f.path.startsWith('code/') &&
      /\.(html|ts|md)$/.test(f.path),
  );
  let next = 0;
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (next < files.length) {
        const entry = files[next++];
        const target = path.join(baselineDir, entry.path);
        if (existsSync(target) && gitBlob(readFileSync(target)) === entry.sha)
          continue;
        const response = await fetch(
          `https://raw.githubusercontent.com/ducmanh001/litmatch-feature-flows/${BASELINE_COMMIT}/${entry.path}`,
          { signal: AbortSignal.timeout(30_000) },
        );
        if (!response.ok)
          throw new Error(`${entry.path}: HTTP ${response.status}`);
        const content = Buffer.from(await response.arrayBuffer());
        assert.equal(
          gitBlob(content),
          entry.sha,
          `Baseline integrity: ${entry.path}`,
        );
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
    }),
  );
  writeFileSync(
    path.join(baselineDir, 'manifest.json'),
    JSON.stringify({ commit: BASELINE_COMMIT, files }, null, 2) + '\n',
  );
  return files;
}

export function splitBody(source) {
  const lines = source.split('\n');
  const first = lines.findIndex((line) =>
    /^\/\/ \[(?:CONTROLLER|SERVICE|WORKER)\]/.test(line),
  );
  if (first < 0) throw new Error('Missing first source block');
  return { first, lines, body: lines.slice(first).join('\n') };
}

export function fullSteps(body, endpoint) {
  const declared = [...(endpoint.steps ?? [])];
  const result = [];
  for (const line of body.split('\n')) {
    const match = /^\s*\/\/ Step (\d+): (.+)$/.exec(line);
    if (!match) continue;
    const prefix = match[2].trim();
    const candidates = declared.filter((s) => s.text.startsWith(prefix));
    if (candidates.length !== 1)
      throw new Error(`Cannot resolve complete Step ${match[1]}: ${prefix}`);
    const step = candidates[0];
    declared.splice(declared.indexOf(step), 1);
    result.push({ number: Number(match[1]), text: step.text });
  }
  assert.equal(declared.length, 0, 'Every catalog Step must be retained');
  assert.ok(
    result.length > 0 && result.every((s, i) => s.number === i + 1),
    'Step order must be sequential',
  );
  return result;
}

export function simplifyEndpoint(source, html, feature, endpoint) {
  const { first, lines, body } = splitBody(source);
  const steps = fullSteps(body, endpoint);
  const header = [
    `//  ${endpoint.method} ${endpoint.route}`,
    `//  ${endpoint.title}`,
    ...steps.map((s) => `//  Step ${s.number}: ${s.text}`),
    '',
  ];
  const output = header.join('\n') + '\n' + body;
  const delta = header.length - first;
  const rows = [...html.matchAll(/<div class="ln [^\n]+?<\/div>/g)];
  assert.equal(
    rows.length,
    lines.length - (lines.at(-1) === '' ? 1 : 0),
    'HTML and raw lines must agree',
  );
  const bodyRows = rows
    .slice(first)
    .map((r) =>
      r[0].replace(
        /(id="L|href="#L|data-n=")(\d+)(")/g,
        (_, a, n, z) => `${a}${Number(n) + delta}${z}`,
      ),
    );
  const newLines = output.split('\n');
  const positions = new Map(
    newLines.flatMap((line, i) => {
      const match = /^\s*\/\/ Step (\d+):/.exec(line);
      return match ? [[Number(match[1]), i + 1]] : [];
    }),
  );
  const headerRows = header.map((text, i) => {
    const n = i + 1;
    const step = /^\/\/  Step (\d+):/.exec(text);
    const content = `<span class="pl-c">${escape(text)}</span>`;
    const inner = step
      ? `<a class="step-link" href="#L${positions.get(Number(step[1]))}">${content}</a>`
      : content;
    return `<div class="ln ${i < 2 ? 'sec' : text ? 'head' : 'blank'}" id="L${n}"><a class="n" href="#L${n}" data-n="${n}"></a><span class="t">${inner || '&nbsp;'}</span></div>`;
  });
  const start = rows[0].index;
  const end = rows.at(-1).index + rows.at(-1)[0].length;
  let rendered =
    html.slice(0, start) +
    [...headerRows, ...bodyRows].join('\n') +
    html.slice(end);
  rendered = rendered.replace(
    /(<span class="meta">)\d+ dòng/,
    `$1${newLines.length - 1} dòng`,
  );
  const id = `${feature.id}/${endpoint.n}-${endpoint.slug}`;
  rendered = rendered.replace(
    '</head>',
    `<meta name="description" content="${escape(endpoint.title)}"/>\n<link rel="alternate" type="application/json" href="../../ai/flows/${id}.json"/>\n<link rel="alternate" type="text/plain" href="../../llms-full.txt"/>\n</head>`,
  );
  rendered = rendered.replace(
    '<div class="actions">',
    '<div class="actions">\n      <a class="btn" href="../../ai/index.html">AI / Văn bản</a>',
  );
  const synthetic = rows.flatMap((row, i) =>
    i >= first && /class="ln [^"]*\bsyn\b/.test(row[0])
      ? [lines[i].trim()]
      : [],
  );
  const sources = [
    ...new Set(
      endpoint.items
        .flatMap((item) => [
          item.file,
          ...(item.ranges ?? []).map((r) => r.file),
          ...(item.helpers ?? []).map((h) => h.file),
        ])
        .filter(Boolean),
    ),
  ].sort();
  const manifest = {
    mode: 'published-presentation',
    baselineCommit: BASELINE_COMMIT,
    sourceCommit: /litmatch @ ([a-f\d]+)/.exec(html)?.[1] ?? null,
    sources,
    steps: steps.map((s) => `Step ${s.number}: ${s.text}`),
    removedOverview: lines.slice(0, first).join('\n'),
    baselineBodySha256: sha256(body),
    bodySha256: sha256(splitBody(output).body),
    rawSha256: sha256(output),
    codeSha256: sha256(output),
  };
  assert.equal(
    manifest.bodySha256,
    manifest.baselineBodySha256,
    'Business body must remain byte-for-byte unchanged',
  );
  return { source: output, html: rendered, synthetic, manifest };
}

export async function generatePresentation({ check = false, only } = {}) {
  if (!existsSync(path.join(baselineDir, 'manifest.json')))
    await fetchBaseline();
  const inventory = JSON.parse(
    readFileSync(path.join(baselineDir, 'manifest.json'), 'utf8'),
  );
  const output = new Map();
  const features = (await catalogs()).filter(
    (feature) => !only || feature.id === only,
  );
  if (!features.length) throw new Error(`Unknown feature: ${only}`);
  for (const entry of inventory.files) {
    if (
      only &&
      !entry.path.startsWith(`code/${only}/`) &&
      !['code/index.html', 'code/README.md'].includes(entry.path)
    )
      continue;
    const bytes = readFileSync(path.join(baselineDir, entry.path));
    assert.equal(
      gitBlob(bytes),
      entry.sha,
      `Immutable baseline: ${entry.path}`,
    );
    output.set(entry.path, bytes.toString('utf8'));
  }
  let count = 0;
  for (const feature of features)
    for (const endpoint of feature.endpoints) {
      const base = `code/${feature.id}/${endpoint.n}-${endpoint.slug}`;
      const built = simplifyEndpoint(
        output.get(`${base}.ts`),
        output.get(`${base}.html`),
        feature,
        endpoint,
      );
      output.set(`${base}.ts`, built.source);
      output.set(`${base}.html`, built.html);
      output.set(`${base}.syn.json`, JSON.stringify(built.synthetic));
      output.set(
        `${base}.sources.json`,
        JSON.stringify(built.manifest, null, 2) + '\n',
      );
      count += 1;
    }
  output.set(
    'code/index.html',
    output
      .get('code/index.html')
      .replace(
        '<div class="actions">',
        '<div class="actions"><a class="btn" href="../ai/index.html">AI / Văn bản</a>',
      )
      .replace(
        'Mở trang để xem vai trò từng tầng, từng bảng, từng module liên quan.',
        'Mở trang để đọc đầy đủ Step; dữ liệu tầng, bảng, Redis và module liên quan có trong bản AI / Văn bản.',
      ),
  );
  for (const [file, text] of output) {
    const target = path.join(here, file);
    if (check)
      assert.equal(
        readFileSync(target, 'utf8'),
        text,
        `Stale presentation: ${file}`,
      );
    else {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
  }
  console.log(
    `${count} endpoint headers: ${check ? 'current' : 'updated'}; all source bodies match ${BASELINE_COMMIT.slice(0, 7)}.`,
  );
  return { count, files: [...output.keys()] };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.includes('--fetch-baseline'))
    console.log(`Baseline verified: ${(await fetchBaseline()).length} files.`);
  await generatePresentation({
    check: process.argv.includes('--check'),
    only: process.argv.find((a) => a.startsWith('--only='))?.slice(7),
  });
}
