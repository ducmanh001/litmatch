import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const docsRoot = join(root, 'docs');

function stripMarkdownCode(content) {
  let fence = null;

  return content
    .split('\n')
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
      if (marker !== undefined) {
        if (fence === null) {
          fence = { character: marker[0], length: marker.length };
        } else if (
          marker[0] === fence.character &&
          marker.length >= fence.length
        ) {
          fence = null;
        }
        return '';
      }
      if (fence !== null) return '';
      return line.replace(/(`+)(.*?)\1/gu, '');
    })
    .join('\n');
}

function markdownLinks(content) {
  return [
    ...stripMarkdownCode(content).matchAll(/\[[^\]]*\]\(([^)]+)\)/gu),
  ].map((match) => match[1].trim());
}

function relativeLinkTarget(href) {
  const target = href.split('#', 1)[0];
  if (
    !target ||
    target.startsWith('/') ||
    /^[a-z][a-z\d+.-]*:/iu.test(target)
  ) {
    return null;
  }
  return decodeURIComponent(target);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function headingAnchors(content) {
  const anchors = new Set();
  const occurrences = new Map();

  for (const match of content.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
    const slug = match[1]
      .replace(/<[^>]*>/gu, '')
      .replace(/[`*_~]/gu, '')
      .trim()
      .toLocaleLowerCase('vi-VN')
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/gu, '-');
    const occurrence = occurrences.get(slug) ?? 0;
    anchors.add(occurrence === 0 ? slug : `${slug}-${occurrence}`);
    occurrences.set(slug, occurrence + 1);
  }

  return anchors;
}

test('Markdown link parser ignores fenced and inline code examples', () => {
  assert.deepEqual(
    markdownLinks(
      [
        '```markdown',
        '[fenced](./fenced.md)',
        '```',
        '`[inline](./inline.md)`',
        '[real](./real.md)',
      ].join('\n'),
    ),
    ['./real.md'],
  );
});

test('overview links every numbered canonical document', async () => {
  const overview = await readFile(
    join(docsRoot, '00-overview-and-index.md'),
    'utf8',
  );
  const numberedDocuments = (await readdir(docsRoot))
    .filter((file) => /^\d{2}-.+\.md$/u.test(file))
    .filter((file) => file !== '00-overview-and-index.md')
    .sort();
  const actualTargets = sortedUnique(
    markdownLinks(overview)
      .map(relativeLinkTarget)
      .filter((target) => /^\.\/\d{2}-.+\.md$/u.test(target ?? '')),
  );
  const expectedTargets = numberedDocuments.map((file) => `./${file}`);

  assert.deepEqual(actualTargets, expectedTargets);
});

const indexedDirectories = [
  'adr',
  'services',
  'runbooks',
  'plans',
  'reference',
  'templates',
];

test('overview links every documentation directory landing page', async () => {
  const overview = await readFile(
    join(docsRoot, '00-overview-and-index.md'),
    'utf8',
  );
  const expectedTargets = indexedDirectories
    .map((directory) => `./${directory}/README.md`)
    .sort();
  const actualTargets = sortedUnique(
    markdownLinks(overview)
      .map(relativeLinkTarget)
      .filter((target) => /^\.\/[^/]+\/README\.md$/u.test(target ?? '')),
  );

  assert.deepEqual(actualTargets, expectedTargets);
});

for (const directory of indexedDirectories) {
  test(`docs/${directory}/README.md links every Markdown entry`, async () => {
    const directoryPath = join(docsRoot, directory);
    const index = await readFile(join(directoryPath, 'README.md'), 'utf8');
    const entries = (await readdir(directoryPath))
      .filter((file) => file.endsWith('.md') && file !== 'README.md')
      .sort();
    const expectedTargets = entries.map((file) => `./${file}`);
    const actualTargets = sortedUnique(
      markdownLinks(index)
        .map(relativeLinkTarget)
        .filter(
          (target) =>
            target?.startsWith('./') &&
            target.endsWith('.md') &&
            !target.slice(2).includes('/'),
        ),
    );

    assert.deepEqual(actualTargets, expectedTargets);
  });
}

test('new lifecycle navigation resolves relative Markdown anchors', async () => {
  const sources = [
    '00-overview-and-index.md',
    '08-working-with-agents.md',
    '09-practical-notes.md',
    '18-documentation-automation.md',
    '19-project-lifecycle-and-learning.md',
    'plans/README.md',
    'reference/README.md',
    'reference/lessons-registry.md',
    'runbooks/README.md',
    'services/README.md',
    'templates/README.md',
    'templates/learning-record.md',
  ];

  for (const source of sources) {
    const sourcePath = join(docsRoot, source);
    const content = await readFile(sourcePath, 'utf8');

    for (const href of markdownLinks(content)) {
      const hashIndex = href.indexOf('#');
      if (hashIndex < 0 || /^[a-z][a-z\d+.-]*:/iu.test(href)) continue;

      const encodedTarget = href.slice(0, hashIndex);
      const anchor = decodeURIComponent(href.slice(hashIndex + 1));
      const targetPath = encodedTarget
        ? resolve(dirname(sourcePath), decodeURIComponent(encodedTarget))
        : sourcePath;
      const targetContent = await readFile(targetPath, 'utf8');

      assert.ok(
        headingAnchors(targetContent).has(anchor),
        `${source}: anchor không tồn tại trong ${href}`,
      );
    }
  }
});
