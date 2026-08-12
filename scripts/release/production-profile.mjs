import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

const DEFAULT_ROOT = resolve(import.meta.dirname, '../..');

const REQUIRED_SERVICES = [
  'postgres',
  'redis',
  'livekit',
  'core-api',
  'signaling-gateway',
  'web',
  'edge',
  'alloy',
];

const REQUIRED_PRODUCTION_ENV = {
  'core-api': [
    'DATABASE_URL',
    'JWT_SECRET',
    'AUTH_OTP_PEPPER',
    'AUTH_GUEST_DEVICE_TOKEN_SECRET',
    'SENTRY_DSN',
    'SENTRY_RELEASE',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_HEADERS',
    'GRAFANA_CLOUD_PROMETHEUS_URL',
    'GRAFANA_CLOUD_PROMETHEUS_USER',
    'GRAFANA_CLOUD_LOKI_URL',
    'GRAFANA_CLOUD_LOKI_USER',
    'GRAFANA_CLOUD_API_TOKEN',
    'MATCHING_GUEST_QUOTA_PEPPER',
    'MEDIA_R2_ACCOUNT_ID',
    'MEDIA_R2_BUCKET',
    'MEDIA_R2_ACCESS_KEY_ID',
    'MEDIA_R2_SECRET_ACCESS_KEY',
    'MEDIA_PUBLIC_BASE_URL',
  ],
  'signaling-gateway': [
    'JWT_SECRET',
    'SENTRY_DSN',
    'SENTRY_RELEASE',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_EXPORTER_OTLP_HEADERS',
    'GRAFANA_CLOUD_PROMETHEUS_URL',
    'GRAFANA_CLOUD_PROMETHEUS_USER',
    'GRAFANA_CLOUD_LOKI_URL',
    'GRAFANA_CLOUD_LOKI_USER',
    'GRAFANA_CLOUD_API_TOKEN',
  ],
};

const RUNTIME_DOCKERFILES = [
  ['core-api', 'apps/core-api/Dockerfile', '3000/health/live'],
  [
    'signaling-gateway',
    'apps/signaling-gateway/Dockerfile',
    '3001/health/live',
  ],
  ['web', 'apps/web/Dockerfile', '4300/'],
  ['edge', 'deploy/production/Dockerfile.edge', '127.0.0.1/health'],
];

function readYaml(root, relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new Error(`${relativePath} không tồn tại`);
  return YAML.parse(readFileSync(path, 'utf8'));
}

function addMissing(errors, condition, message) {
  if (!condition) errors.push(message);
}

function hasRequiredInterpolation(value) {
  return typeof value === 'string' && /:\?required\}/u.test(value);
}

function validateCompose(root, errors) {
  const compose = readYaml(root, 'deploy/production/compose.yml');
  const services = compose?.services ?? {};

  for (const service of REQUIRED_SERVICES) {
    addMissing(
      errors,
      services[service] !== undefined,
      `production compose thiếu service ${service}`,
    );
  }

  for (const [serviceName, keys] of Object.entries(REQUIRED_PRODUCTION_ENV)) {
    const environment = services[serviceName]?.environment ?? {};
    addMissing(
      errors,
      environment.OBSERVABILITY_REQUIRED === 'true',
      `${serviceName} phải đặt OBSERVABILITY_REQUIRED=true`,
    );
    for (const key of keys) {
      addMissing(
        errors,
        hasRequiredInterpolation(environment[key]),
        `${serviceName}.environment.${key} phải là biến bắt buộc (:?required)`,
      );
    }
  }

  const coreEnvironment = services['core-api']?.environment ?? {};
  addMissing(
    errors,
    coreEnvironment.MEDIA_STORAGE_PROVIDER === 'r2',
    'production compose phải chọn storage provider R2 đã được cấu hình',
  );
  addMissing(
    errors,
    coreEnvironment.VIDEO_UPLOAD_ENABLED === 'false',
    'production compose phải giữ video upload tắt khi chưa có lifecycle transcode',
  );

  const dependencies = services['edge']?.depends_on ?? {};
  for (const service of ['core-api', 'signaling-gateway', 'web']) {
    addMissing(
      errors,
      dependencies[service]?.condition === 'service_healthy',
      `edge phải chờ ${service} healthy trước khi nhận traffic`,
    );
  }
  addMissing(
    errors,
    services.livekit?.depends_on?.redis?.condition === 'service_healthy',
    'livekit phải chờ Redis healthy',
  );
}

function validateRuntimeDockerfiles(root, errors) {
  for (const [name, relativePath, probe] of RUNTIME_DOCKERFILES) {
    const path = resolve(root, relativePath);
    if (!existsSync(path)) {
      errors.push(`${relativePath} không tồn tại`);
      continue;
    }
    const dockerfile = readFileSync(path, 'utf8');
    addMissing(
      errors,
      /\bHEALTHCHECK\b/u.test(dockerfile),
      `${name} image thiếu HEALTHCHECK`,
    );
    addMissing(
      errors,
      dockerfile.includes(probe),
      `${name} HEALTHCHECK không kiểm tra endpoint ${probe}`,
    );
  }
}

function validateKubernetes(root, errors) {
  const coreDeployment = readYaml(root, 'k8s/base/core-api/deployment.yaml');
  const signalingDeployment = readYaml(
    root,
    'k8s/base/signaling-gateway/deployment.yaml',
  );
  const mediaDeployment = readYaml(
    root,
    'k8s/base/media-server/deployment.yaml',
  );
  const coreConfig = readYaml(root, 'k8s/base/core-api/configmap.yaml');
  const signalingConfig = readYaml(
    root,
    'k8s/base/signaling-gateway/configmap.yaml',
  );
  const production = readYaml(
    root,
    'k8s/overlays/production/kustomization.yaml',
  );
  const corePatch = readYaml(
    root,
    'k8s/overlays/production/core-api-patch.yaml',
  );
  const signalingPatch = readYaml(
    root,
    'k8s/overlays/production/signaling-gateway-patch.yaml',
  );
  const mediaPatch = readYaml(
    root,
    'k8s/overlays/production/media-server-patch.yaml',
  );

  for (const [name, deployment] of [
    ['core-api', coreDeployment],
    ['signaling-gateway', signalingDeployment],
  ]) {
    const container = deployment.spec?.template?.spec?.containers?.[0];
    addMissing(
      errors,
      container !== undefined,
      `Kubernetes ${name} thiếu container`,
    );
    if (!container) continue;
    addMissing(
      errors,
      container.livenessProbe?.httpGet?.path === '/health/live' &&
        container.livenessProbe.httpGet.port === 'http',
      `Kubernetes ${name} liveness probe không đúng /health/live`,
    );
    addMissing(
      errors,
      container.readinessProbe?.httpGet?.path === '/health/ready' &&
        container.readinessProbe.httpGet.port === 'http',
      `Kubernetes ${name} readiness probe không đúng /health/ready`,
    );
    addMissing(
      errors,
      container.envFrom?.some((entry) => entry.configMapRef?.name) &&
        container.envFrom?.some((entry) => entry.secretRef?.name),
      `Kubernetes ${name} phải lấy cả ConfigMap và Secret`,
    );
  }

  addMissing(
    errors,
    coreConfig.data?.OBSERVABILITY_REQUIRED === 'true',
    'Kubernetes core-api phải đặt OBSERVABILITY_REQUIRED=true',
  );
  addMissing(
    errors,
    signalingConfig.data?.OBSERVABILITY_REQUIRED === 'true',
    'Kubernetes signaling-gateway phải đặt OBSERVABILITY_REQUIRED=true',
  );
  addMissing(
    errors,
    production.resources?.includes('../../base') &&
      production.patches?.some(
        (patch) => patch.path === 'core-api-patch.yaml',
      ) &&
      production.patches?.some(
        (patch) => patch.path === 'signaling-gateway-patch.yaml',
      ),
    'Kubernetes production overlay phải kế thừa base và patch core/signaling',
  );
  addMissing(
    errors,
    corePatch.spec?.replicas >= 2 && signalingPatch.spec?.replicas >= 2,
    'Kubernetes production phải có ít nhất 2 replica cho core-api và signaling-gateway',
  );
  addMissing(
    errors,
    mediaDeployment.spec?.replicas === 1 &&
      mediaDeployment.spec?.strategy?.type === 'Recreate' &&
      mediaPatch.spec?.template?.spec?.containers?.[0]?.resources !== undefined,
    'Kubernetes media-server phải giữ topology 1 replica/Recreate và resource override',
  );
  addMissing(
    errors,
    mediaDeployment.spec?.template?.spec?.hostNetwork === true,
    'Kubernetes media-server phải bật hostNetwork theo ADR LiveKit RTC',
  );
}

export function validateProductionProfile(root = DEFAULT_ROOT) {
  const errors = [];
  try {
    validateCompose(root, errors);
    validateRuntimeDockerfiles(root, errors);
    validateKubernetes(root, errors);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return errors;
}

export function assertProductionProfile(root = DEFAULT_ROOT) {
  const errors = validateProductionProfile(root);
  if (errors.length > 0) {
    throw new Error(
      `Production profile không hợp lệ:\n- ${errors.join('\n- ')}`,
    );
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  assertProductionProfile();
  console.info('Production profile contract: PASS');
}
