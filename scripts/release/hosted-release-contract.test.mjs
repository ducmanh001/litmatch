import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/hosted-release.yml', 'utf8');

test('hosted release keeps frontend deploys parallel and delegates concurrent smoke checks', () => {
  assert.match(
    workflow,
    /cloudflare-deploy -p web,admin --parallel=2 --skip-nx-cache --outputStyle=static/u,
  );
  assert.match(workflow, /run: node scripts\/release\/public-smoke\.mjs/u);
  assert.doesNotMatch(workflow, /smoke\(\)\s*\{/u);
});

test('hosted release still installs from the frozen lockfile with offline preference', () => {
  assert.match(workflow, /pnpm install --frozen-lockfile --prefer-offline/u);
  assert.doesNotMatch(workflow, /--no-frozen-lockfile/u);
});
