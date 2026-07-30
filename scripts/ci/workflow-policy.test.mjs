import assert from 'node:assert/strict';
import test from 'node:test';

import { workflowPolicyErrors } from './workflow-policy.mjs';

const pinnedAction =
  'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10';
const triggers = `on:
  pull_request:
  merge_group:
  workflow_dispatch:
`;
const frontendBuildEnvironment = `env:
  NEXT_PUBLIC_API_URL: http://localhost:3000
  NEXT_PUBLIC_SOCKET_URL: http://localhost:3001
  NEXT_PUBLIC_LIVEKIT_URL: ws://localhost:7880
`;
const hostedReleaseWorkflow = `on:
  workflow_run:
jobs:
  deploy:
    if: >-
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'main' &&
      github.event.workflow_run.conclusion == 'success'
    env:
      NX_TUI: 'false'
    steps:
      - uses: ${pinnedAction}
      - run: >-
          gh api 'actions/workflows/ci.yml/runs?head_sha=\${RELEASE_SHA}&status=completed&per_page=100'
          --jq '.head_sha == env.RELEASE_SHA and .head_branch == "main" and .event == "push"'
      - run: pnpm install --frozen-lockfile
      - run: pnpm nx run core-api:migration-run --outputStyle=static
`;

test('accepts repo-wide PR and merge-queue workflows with stable required checks', () => {
  const errors = workflowPolicyErrors({
    ciWorkflow: `${triggers}${frontendBuildEnvironment}
jobs:
  quality:
    steps:
      - uses: ${pinnedAction}
      - run: pnpm ci:local:quick
  required:
    name: CI required
`,
    hostedReleaseWorkflow,
    securityWorkflow: `${triggers}
jobs:
  dependency-review:
    steps:
      - uses: actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294
        with:
          fail-on-severity: high
  required:
    name: Security required
`,
  });

  assert.deepEqual(errors, []);
});

test('accepts the repo when the security workflow is absent', () => {
  const errors = workflowPolicyErrors({
    ciWorkflow: `${triggers}${frontendBuildEnvironment}
jobs:
  quality:
    steps:
      - uses: ${pinnedAction}
      - run: pnpm ci:local:quick
  required:
    name: CI required
`,
    hostedReleaseWorkflow,
    securityWorkflow: undefined,
  });

  assert.deepEqual(errors, []);
});

test('rejects missing PR coverage, floating actions and unstable required checks', () => {
  const errors = workflowPolicyErrors({
    ciWorkflow: `on:
  push:
jobs:
  quality:
    steps:
      - uses: actions/checkout@v6
`,
    hostedReleaseWorkflow,
    securityWorkflow: `on:
  schedule:
jobs:
  scan:
    steps:
      - uses: ./local-action
`,
  });

  assert.ok(errors.some((error) => error.includes('pull_request')));
  assert.ok(errors.some((error) => error.includes('merge_group')));
  assert.ok(errors.some((error) => error.includes('actions/checkout@v6')));
  assert.ok(errors.some((error) => error.includes('CI required')));
  assert.ok(errors.some((error) => error.includes('NEXT_PUBLIC_API_URL')));
  assert.ok(errors.some((error) => error.includes('Security required')));
  assert.ok(errors.some((error) => error.includes('dependency review')));
});

test('rejects bypassable or nondeterministic release workflows', () => {
  const errors = workflowPolicyErrors({
    ciWorkflow: `${triggers}env:
  CI_BYPASS: true
  NEXT_PUBLIC_API_URL: http://localhost:3000
  NEXT_PUBLIC_SOCKET_URL: http://localhost:3001
  NEXT_PUBLIC_LIVEKIT_URL: ws://localhost:7880
jobs:
  quality:
    steps:
      - uses: ${pinnedAction}
      - run: pnpm ci:local:quick
  required:
    name: CI required
`,
    hostedReleaseWorkflow: `on:
  workflow_run:
jobs:
  deploy:
    steps:
      - uses: actions/checkout@v6
      - run: pnpm install --no-frozen-lockfile
      - run: pnpm nx run core-api:migration-run
`,
    securityWorkflow: undefined,
  });

  assert.ok(errors.some((error) => error.includes('bypass')));
  assert.ok(errors.some((error) => error.includes('pin action')));
  assert.ok(errors.some((error) => error.includes('trigger push')));
  assert.ok(errors.some((error) => error.includes('main')));
  assert.ok(errors.some((error) => error.includes('frozen')));
  assert.ok(errors.some((error) => error.includes('NX_TUI')));
  assert.ok(errors.some((error) => error.includes('outputStyle')));
  assert.ok(errors.some((error) => error.includes('exact SHA')));
});

test('rejects command-line bypasses in GitHub CI', () => {
  const errors = workflowPolicyErrors({
    ciWorkflow: `${triggers}${frontendBuildEnvironment}
jobs:
  quality:
    steps:
      - uses: ${pinnedAction}
      - run: pnpm ci:local:quick --bypass
  required:
    name: CI required
`,
    hostedReleaseWorkflow,
    securityWorkflow: undefined,
  });

  assert.ok(errors.some((error) => error.includes('bypass')));
});
