import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const script = 'scripts/ci/local.mjs';
const runtimeDockerfiles = [
  'apps/core-api/Dockerfile',
  'apps/signaling-gateway/Dockerfile',
  'deploy/hosted/Dockerfile.core-api',
  'deploy/hosted/Dockerfile.signaling-gateway',
];

function dryRun(profile, ...args) {
  const {
    LOCAL_CI_DATABASE_URL: _databaseUrl,
    LOCAL_CI_REDIS_URL: _redisUrl,
    LOCAL_CI_INTEGRATION_DB_URL: _integrationDatabaseUrl,
    LOCAL_CI_SERVICES_READY: _servicesReady,
    LOCAL_CI_DATABASE_READY: _databaseReady,
    CI: _ci,
    GITHUB_ACTIONS: _githubActions,
    ...testEnvironment
  } = process.env;

  return spawnSync(process.execPath, [script, profile, '--dry-run', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: testEnvironment,
  });
}

function dryRunWithCiServices(profile, ...args) {
  return spawnSync(process.execPath, [script, profile, '--dry-run', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      LOCAL_CI_SERVICES_READY: 'true',
      LOCAL_CI_DATABASE_READY: 'true',
    },
  });
}

test('quick local CI profile resets Nx and runs the quality gate', () => {
  const result = dryRun('quick');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reset Nx daemon and project-graph cache/u);
  assert.match(result.stdout, /Format check/u);
  assert.match(result.stdout, /Validate every GitHub Actions workflow/u);
  assert.match(result.stdout, /Lint every Nx project/u);
});

test('aggregate gates own stage watchdogs instead of a blanket 45-second timeout', () => {
  const localCi = readFileSync('scripts/ci/local.mjs', 'utf8');
  const agentVerify = readFileSync('scripts/agent/verify.mjs', 'utf8');
  const agentContract = readFileSync('AGENTS.md', 'utf8');
  const packageJson = readFileSync('package.json', 'utf8');

  assert.match(localCi, /run-stage\.mjs/u);
  assert.match(localCi, /LOCAL_CI_STAGE_TIMEOUT_MS/u);
  assert.match(localCi, /NX_TUI:\s*'false'/u);
  assert.match(localCi, /NX_CACHE_DIRECTORY:/u);
  assert.match(localCi, /NX_WORKSPACE_DATA_DIRECTORY:/u);
  assert.match(localCi, /tmpdir\(\), 'litmatch-local-ci'/u);
  assert.doesNotMatch(localCi, /\.nx', 'local-ci-(?:cache|workspace-data)/u);
  assert.match(localCi, /--outputStyle=static/u);
  assert.match(agentVerify, /run-stage\.mjs/u);
  assert.match(agentVerify, /AGENT_VERIFY_STAGE_TIMEOUT_MS/u);
  assert.match(agentVerify, /NX_TUI:\s*'false'/u);
  assert.match(agentVerify, /--outputStyle=static/u);
  assert.match(
    packageJson,
    /"lint":\s*"nx run-many -t lint --outputStyle=static"/u,
  );
  assert.match(
    packageJson,
    /"test":\s*"nx run-many -t test --outputStyle=static"/u,
  );
  assert.match(agentVerify, /timeout: 45_000/u);
  assert.match(localCi, /ownsInnerWatchdogs/u);
  assert.match(
    readFileSync('nx.json', 'utf8'),
    /"tui":\s*\{\s*"enabled":\s*false\s*\}/su,
  );
  assert.match(agentContract, /NX_TUI=false[\s\S]{0,160}--outputStyle=static/u);
});

test('commit owns formatting and staged guard checks; push owns the complete preflight', () => {
  const commitHook = readFileSync('.husky/pre-commit', 'utf8');
  const pushHook = readFileSync('.husky/pre-push', 'utf8');
  const repositoryCheck = readFileSync(
    'scripts/agent/repository-check.mjs',
    'utf8',
  );

  assert.match(commitHook, /lint-staged[\s\S]*agent:check -- --staged/u);
  assert.match(pushHook, /pnpm ci:preflight/u);
  assert.match(pushHook, /export NX_TUI=false/u);
  assert.match(pushHook, /export NX_DAEMON=false/u);
  assert.match(pushHook, /export NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false/u);
  assert.match(pushHook, /export TERM=dumb/u);
  assert.doesNotMatch(pushHook, /ci:local:clean/u);
  assert.match(commitHook, /LITMATCH_CI_BYPASS/u);
  assert.match(pushHook, /LITMATCH_CI_BYPASS/u);
  assert.match(
    repositoryCheck,
    /if \(stagedMode\)[\s\S]{0,120}indexEntries\.has\(path\)[\s\S]{0,80}readIndexSymlink\(path\)/u,
  );
});

test('Husky hooks remain POSIX-shell compatible', () => {
  for (const hook of ['.husky/pre-commit', '.husky/pre-push']) {
    const result = spawnSync('sh', ['-n', hook], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `${hook}: ${result.stderr}`);
  }
});

test('local CI bypass exits cleanly before any stage', () => {
  const result = dryRun('all', '--bypass');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Bypass enabled for profile all/u);
  assert.doesNotMatch(result.stdout, /Install dependencies/u);
});

test('local CI rejects every bypass mechanism in a CI environment', () => {
  for (const bypass of [
    { args: ['--bypass'], env: {} },
    { args: [], env: { LITMATCH_CI_BYPASS: 'true' } },
    { args: [], env: { CI_BYPASS: 'true' } },
  ]) {
    const result = spawnSync(
      process.execPath,
      [script, 'quick', '--dry-run', ...bypass.args],
      {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, CI: 'true', ...bypass.env },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Refusing bypass/u);
    assert.doesNotMatch(result.stdout, /Install dependencies/u);
  }
});

test('GitHub CI uses the same local profiles for quality, tests, and containers', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

  assert.match(workflow, /run: pnpm ci:local:quick/u);
  assert.match(workflow, /run: pnpm ci:local\s*$/mu);
  assert.match(workflow, /run: pnpm ci:local:docker/u);
  assert.match(workflow, /needs: \[quality, test\]/u);
  assert.doesNotMatch(
    workflow,
    /bypass_ci:|LITMATCH_CI_BYPASS|CI_BYPASS|--bypass/u,
  );
  assert.match(workflow, /NX_TUI:\s*['"]false['"]/u);
  assert.match(
    workflow,
    /LOCAL_CI_DATABASE_URL:\s*postgresql:\/\/litmatch:litmatch_local@localhost:5432\/litmatch/u,
  );
  assert.match(
    workflow,
    /LOCAL_CI_INTEGRATION_DB_URL:\s*postgresql:\/\/litmatch:litmatch_local@localhost:5432\/litmatch_test/u,
  );
  assert.match(workflow, /LOCAL_CI_SERVICES_READY:\s*['"]true['"]/u);
  assert.match(workflow, /LOCAL_CI_DATABASE_READY:\s*['"]true['"]/u);
});

test('quality profiles check formatting without rewriting the workspace', () => {
  const localCi = readFileSync('scripts/ci/local.mjs', 'utf8');
  const qualityGates = readFileSync('docs/runbooks/quality-gates.md', 'utf8');

  assert.doesNotMatch(localCi, /Auto-fix formatting before quality checks/u);
  assert.doesNotMatch(localCi, /stage\('clean: format', 'pnpm format'\)/u);
  assert.match(localCi, /\['format:check'\]/u);
  assert.match(qualityGates, /Quick\/clean\/preflight không tự sửa source/u);
});

test('local and GitHub CI provide every required non-database application secret', () => {
  const localCi = readFileSync('scripts/ci/local.mjs', 'utf8');
  const coreSmoke = localCi.slice(
    localCi.indexOf("run('Start Core API smoke container'"),
    localCi.indexOf("run('Start Signaling Gateway smoke container'"),
  );

  for (const variable of [
    'JWT_SECRET',
    'AUTH_OTP_PEPPER',
    'AUTH_GUEST_DEVICE_TOKEN_SECRET',
    'MATCHING_GUEST_QUOTA_PEPPER',
  ]) {
    assert.match(localCi, new RegExp(`\\b${variable}:`, 'u'), variable);
    assert.match(
      coreSmoke,
      new RegExp(`${variable}=\\$\\{environment\\.${variable}\\}`, 'u'),
      `${variable} must reach the clean Core API smoke container`,
    );
  }
});

test('backend runtime images install with the canonical pnpm settings', () => {
  for (const dockerfilePath of runtimeDockerfiles) {
    const dockerfile = readFileSync(dockerfilePath, 'utf8');

    assert.match(
      dockerfile,
      /COPY .*pnpm-workspace\.yaml \.\//u,
      dockerfilePath,
    );
    assert.match(
      dockerfile,
      /pnpm install --prod --frozen-lockfile/u,
      dockerfilePath,
    );
  }
});

test('web runtime image removes package-manager toolchains', () => {
  const dockerfile = readFileSync('apps/web/Dockerfile', 'utf8');

  assert.match(dockerfile, /rm -rf .*node_modules\/npm/u);
  assert.match(dockerfile, /node_modules\/corepack/u);
  assert.match(dockerfile, /\/opt\/yarn-v1\.22\.22/u);
});

test('clean local CI profile uses an empty node_modules volume in Node 22 Linux', () => {
  const result = dryRun('clean');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[ci-local\] \$ docker \[args hidden\]/u);
  assert.doesNotMatch(result.stdout, /bash -lc/u);
});

test('all local CI profile plans quality, test, and Docker smoke stages', () => {
  const result = dryRun('all');

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Run quality gate in a clean Node 22 Linux container/u,
  );
  assert.match(result.stdout, /Ensure isolated database litmatch_ci/u);
  assert.match(result.stdout, /Start local PostgreSQL and Redis/u);
  assert.match(result.stdout, /End-to-end smoke tests/u);
  assert.match(
    result.stdout,
    /Signaling Redis integration tests with isolated CPU/u,
  );
  assert.match(
    result.stdout,
    /Remaining unit and integration tests with coverage/u,
  );
  assert.ok(
    result.stdout.indexOf('Signaling Redis integration tests') <
      result.stdout.indexOf('Remaining unit and integration tests'),
  );
  const localCi = readFileSync('scripts/ci/local.mjs', 'utf8');
  assert.match(
    localCi,
    /Remaining unit and integration tests with coverage[\s\S]{0,350}--exclude=admin,web,api-client,signaling-gateway/u,
  );
  assert.match(result.stdout, /Build Core API image/u);
  assert.match(result.stdout, /Build Web image/u);
  assert.match(result.stdout, /Build Edge image/u);
  assert.match(result.stdout, /Start Web smoke container/u);
  assert.match(result.stdout, /Validate Edge configuration/u);
  assert.match(result.stdout, /\[ci-local\] \$ pnpm \[args hidden\]/u);
  assert.match(result.stdout, /\[ci-local\] \$ docker \[args hidden\]/u);
  assert.doesNotMatch(result.stdout, /local-ci-jwt-0123456789abcdef-xyz/u);
  assert.doesNotMatch(result.stdout, /local-ci-pepper-0123456789/u);
  assert.doesNotMatch(
    result.stdout,
    /litmatch_local@localhost:5432\/litmatch_ci/u,
  );
  assert.doesNotMatch(result.stdout, /redis:\/\/localhost:6379\/15/u);
});

test('CI-provided services are reused without creating a local database', () => {
  const result = dryRunWithCiServices('ci');

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Reuse CI-provided PostgreSQL and Redis/u);
  assert.match(result.stdout, /Reuse CI-provided isolated database/u);
  assert.doesNotMatch(result.stdout, /Start local PostgreSQL and Redis/u);
  assert.doesNotMatch(result.stdout, /Ensure isolated database litmatch_ci/u);
});

test('security local CI profile is disabled and does not run scans', () => {
  const result = dryRun('security');

  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /Security profile is disabled; skipping secret and vulnerability scans\./u,
  );
  assert.doesNotMatch(result.stdout, /Scan Git history for secrets/u);
  assert.doesNotMatch(result.stdout, /Scan Core API runtime image/u);
});

test('local CI rejects an unsupported profile', () => {
  const result = dryRun('not-a-profile');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /profile không hợp lệ/u);
});
