import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const root = process.cwd();
const run = promisify(execFile);

async function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8');
}

async function trackedRuntimeConfigPaths() {
  const { stdout } = await run('git', ['ls-files', '-z'], {
    cwd: root,
    maxBuffer: 10 * 1024 * 1024,
  });

  return stdout
    .split('\0')
    .filter(Boolean)
    .filter(
      (path) =>
        path.endsWith('.env.example') ||
        (/\.ya?ml$/u.test(path) &&
          !path.startsWith('docs/') &&
          !path.startsWith('specs/') &&
          !path.startsWith('.github/')) ||
        /(?:^|\/)(?:wrangler|vercel|firebase)\.(?:jsonc?|toml)$/u.test(path) ||
        /(?:^|\/)(?:next|vite|webpack|jest)\.config\.[cm]?[jt]s$/u.test(path),
    )
    .sort();
}

test('Compose lấy local credential, public URL và host port từ env', async () => {
  const [baseCompose, devCompose, envExample] = await Promise.all([
    read('docker-compose.yml'),
    read('docker-compose.dev.yml'),
    read('.env.example'),
  ]);

  for (const variable of [
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'POSTGRES_HOST_PORT',
    'REDIS_HOST_PORT',
    'KAFKA_HOST_PORT',
  ]) {
    assert.match(baseCompose, new RegExp(`\\$\\{${variable}[:-]`, 'u'));
    assert.match(envExample, new RegExp(`^${variable}=`, 'mu'));
  }

  for (const variable of [
    'CORS_ORIGINS',
    'LIVEKIT_URL',
    'VITE_API_URL',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_SOCKET_URL',
    'NEXT_PUBLIC_LIVEKIT_URL',
    'DEV_LAN_IP',
    'DEV_ALLOWED_ORIGINS',
  ]) {
    assert.match(devCompose, new RegExp(`\\$\\{${variable}[:-]`, 'u'));
    assert.match(envExample, new RegExp(`^${variable}=`, 'mu'));
  }
});

test('file tracked không chứa tunnel id, private LAN IP hoặc local DB credential rải rác', async () => {
  const files = await trackedRuntimeConfigPaths();
  assert.ok(files.includes('deploy/production/compose.yml'));
  assert.ok(files.includes('k8s/base/media-server/configmap.yaml'));
  assert.ok(files.includes('apps/web/wrangler.jsonc'));

  const contents = await Promise.all(files.map(read));
  const trackedConfig = contents.join('\n');
  const credentialConfig = files
    .map((path, index) => ({ path, content: contents[index] }))
    .filter(({ path }) => !path.endsWith('.env.example'))
    .map(({ content }) => content)
    .join('\n');

  assert.doesNotMatch(trackedConfig, /[a-z0-9]+-\d+\.asse\.devtunnels\.ms/iu);
  assert.doesNotMatch(
    trackedConfig,
    /(?:^|[^\d])(?:10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?:[^\d]|$)/u,
  );
  assert.doesNotMatch(
    credentialConfig,
    /["']?POSTGRES_PASSWORD["']?\s*[:=]\s*["']?litmatch_local/u,
  );
  assert.doesNotMatch(
    credentialConfig,
    /["']?DATABASE_URL["']?\s*[:=]\s*["']?postgresql:\/\/litmatch:litmatch_local/u,
  );
});

test('mọi LiveKit webhook dùng đúng global API prefix', async () => {
  const files = [
    'apps/media-server/livekit.compose.yaml',
    'apps/media-server/livekit.yaml',
    'deploy/production/livekit.yaml',
    'k8s/base/media-server/configmap.yaml',
  ];
  const contents = await Promise.all(files.map(read));

  for (const content of contents) {
    assert.match(content, /\/api\/v1\/calling\/webhooks\/livekit/u);
    assert.match(content, /\/api\/v1\/party\/webhooks\/livekit/u);
    assert.doesNotMatch(
      content,
      /:3000\/(?:calling|party)\/webhooks\/livekit/u,
    );
  }
});

test('mọi production profile tắt upload video khi chưa có provider thật', async () => {
  const files = [
    'deploy/hosted/core-api.env.example',
    'deploy/production/compose.yml',
    'k8s/base/core-api/configmap.yaml',
  ];
  const contents = await Promise.all(files.map(read));

  for (const content of contents) {
    assert.match(content, /VIDEO_UPLOAD_ENABLED(?::|=)\s*['"]?false/u);
  }
});
