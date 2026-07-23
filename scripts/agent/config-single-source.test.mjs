import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function read(relativePath) {
  return readFile(join(root, relativePath), 'utf8');
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
  const files = [
    'docker-compose.yml',
    'docker-compose.dev.yml',
    'apps/media-server/docker-compose.yml',
    'apps/media-server/livekit.compose.yaml',
    'apps/media-server/livekit.yaml',
    'apps/web/next.config.js',
  ];
  const contents = await Promise.all(files.map(read));
  const trackedConfig = contents.join('\n');

  assert.doesNotMatch(trackedConfig, /[a-z0-9]+-\d+\.asse\.devtunnels\.ms/iu);
  assert.doesNotMatch(
    trackedConfig,
    /(?:^|[^\d])(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}(?:[^\d]|$)/u,
  );
  assert.doesNotMatch(trackedConfig, /POSTGRES_PASSWORD:\s*litmatch_local/u);
  assert.doesNotMatch(
    trackedConfig,
    /DATABASE_URL:\s*postgresql:\/\/litmatch:litmatch_local/u,
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
