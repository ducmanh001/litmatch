// AI additions only: no deletions, main index changes, history rewriting or attribution trailers.
// review-module: N/A — documentation publication tooling only.
// node layouts/feature-flows/publish-ai.mjs [--push]
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  currentAI_PATHS,
  generateAi,
  isAiOutputPath,
  safeRelativePath,
} from './generate-ai.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const OWNER_REPO = 'ducmanh001/litmatch-feature-flows';
export const MAX_BATCH_BYTES = 4_500_000;
const query =
  'mutation($input: CreateCommitOnBranchInput!) { createCommitOnBranch(input: $input) { commit { oid url } } }';

export function publicationAdditions(sourceDir, relativePaths) {
  const root = realpathSync(sourceDir);
  const payload = JSON.parse(
    readFileSync(path.join(root, 'ai/flows.json'), 'utf8'),
  );
  const expected = currentAI_PATHS(payload);
  if (JSON.stringify(payload.inventory?.paths) !== JSON.stringify(expected))
    throw new Error('AI inventory drift');
  const selected = relativePaths ?? expected;
  if (
    selected.length !== expected.length ||
    new Set(selected).size !== expected.length ||
    selected.some(
      (relative) =>
        !expected.includes(safeRelativePath(relative)) ||
        !isAiOutputPath(relative),
    )
  )
    throw new Error(
      'Publication must contain exactly the generated AI allowlist',
    );
  return selected.map((relative) => {
    const local = realpathSync(path.join(root, relative));
    const inside = path.relative(root, local);
    if (inside.startsWith('..') || path.isAbsolute(inside))
      throw new Error(`Publication source escapes root: ${relative}`);
    return { path: relative, contents: readFileSync(local).toString('base64') };
  });
}

export function commitInput(additions, head, allowedPaths) {
  const paths = additions.map((addition) => addition.path);
  if (
    !paths.length ||
    new Set(paths).size !== paths.length ||
    paths.some(
      (relative) =>
        !isAiOutputPath(relative) ||
        (allowedPaths && !allowedPaths.includes(relative)),
    )
  )
    throw new Error('Unsafe publication additions');
  if (!/^[a-f\d]{40}$/u.test(head)) throw new Error('Invalid remote head');
  return {
    branch: { repositoryNameWithOwner: OWNER_REPO, branchName: 'main' },
    message: {
      headline: 'Publish crawlable text, diagram catalogs and annotated code',
      body: 'Add AI reading guides, a static link index, code and diagram JSON chunks, a complete bundle and a sitemap. Existing site pages and code are outside this publication.',
    },
    fileChanges: {
      additions: additions.map(({ path: relative, contents }) => ({
        path: relative,
        contents,
      })),
    },
    expectedHeadOid: head,
  };
}

const request = (additions, head, allowedPaths) => ({
  query,
  variables: { input: commitInput(additions, head, allowedPaths) },
});
const requestSize = (additions) =>
  Buffer.byteLength(JSON.stringify(request(additions, '0'.repeat(40))), 'utf8');

export function batchAdditions(additions, maxBytes = MAX_BATCH_BYTES) {
  if (
    !Number.isInteger(maxBytes) ||
    maxBytes <= 0 ||
    maxBytes > MAX_BATCH_BYTES
  )
    throw new Error('Invalid publication batch limit');
  const batches = [];
  let batch = [];
  for (const addition of additions) {
    if (requestSize([addition]) > maxBytes)
      throw new Error(`AI artifact exceeds batch limit: ${addition.path}`);
    if (batch.length && requestSize([...batch, addition]) > maxBytes) {
      batches.push(batch);
      batch = [];
    }
    batch.push(addition);
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function publishAi({
  sourceDir = here,
  push = false,
  maxBatchBytes = MAX_BATCH_BYTES,
  gh = (args) =>
    execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }),
} = {}) {
  await generateAi({ sourceDir, check: true });
  const additions = publicationAdditions(sourceDir);
  const paths = additions.map((addition) => addition.path);
  const batches = batchAdditions(additions, maxBatchBytes);
  console.log(
    `${push ? 'Publish' : 'Dry run'} ${OWNER_REPO}: ${paths.length} AI files, ${batches.length} batches; deletions: 0; root index/code changes: 0`,
  );
  if (!push) return { pushed: false, paths, batchCount: batches.length };
  let head = gh([
    'api',
    `repos/${OWNER_REPO}/git/ref/heads/main`,
    '--jq',
    '.object.sha',
  ]).trim();
  const temporary = mkdtempSync(path.join(tmpdir(), 'litmatch-publish-ai-'));
  const commits = [];
  try {
    for (const [index, batch] of batches.entries()) {
      const filename = path.join(temporary, `input-${index + 1}.json`);
      const body = request(batch, head, paths);
      if (Buffer.byteLength(JSON.stringify(body), 'utf8') > maxBatchBytes)
        throw new Error('Publication payload exceeds batch limit');
      writeFileSync(filename, JSON.stringify(body));
      const result = JSON.parse(gh(['api', 'graphql', '--input', filename]));
      if (result.errors) throw new Error(JSON.stringify(result.errors));
      const commit = result.data?.createCommitOnBranch?.commit;
      if (!/^[a-f\d]{40}$/u.test(commit?.oid ?? '') || !commit.url)
        throw new Error('Missing created commit');
      commits.push(commit);
      head = commit.oid;
      console.log(`Batch ${index + 1}/${batches.length}: ${commit.url}`);
    }
    return { pushed: true, paths, commits, ...commits.at(-1) };
  } finally {
    // This exact temporary directory was created above; no user-supplied path is removed.
    rmSync(temporary, { recursive: true });
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--push');
  if (unknown.length)
    throw new Error(`Unknown arguments: ${unknown.join(' ')}`);
  await publishAi({ push: process.argv.includes('--push') });
}
