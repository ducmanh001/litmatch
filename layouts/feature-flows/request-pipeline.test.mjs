import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { requestPipeline } from './request-pipeline.mjs';

const endpoint = (domain, className, name) =>
  requestPipeline({
    file: `apps/core-api/src/modules/${domain}/${domain}.controller.ts`,
    className,
    name,
  });

test('authenticated endpoint inherits the registered global pipeline and parameter extractors', () => {
  const pipeline = endpoint('matching', 'MatchingController', 'joinQueue');
  const labels = pipeline.map((item) => item.label);
  for (const label of [
    'JwtAuthGuard.canActivate',
    'RolesGuard.canActivate',
    'ResponseEnvelopeInterceptor.intercept',
    'GlobalExceptionFilter.catch',
    'createHttpMetricsMiddleware',
    'parseCorsOrigins',
    'CurrentUser',
    'IdempotencyKey',
    'extractIdempotencyKey',
  ]) {
    assert.ok(labels.includes(label), `Missing ${label}`);
  }
  const code = pipeline.flatMap((item) => item.lines ?? []).join('\n');
  for (const text of [
    'helmet()',
    'cookieParser()',
    "app.useBodyParser('json')",
    "type: 'application/webhook+json'",
    'new ValidationPipe',
    'forbidNonWhitelisted: true',
    'ClassSerializerInterceptor',
    'ThrottlerGuard',
    "config.getOrThrow('THROTTLE_LIMIT'",
  ]) {
    assert.ok(code.includes(text), `Missing configuration ${text}`);
  }
  assert.ok(!labels.includes('CsrfGuard.canActivate'));
  assert.equal(
    pipeline.find((item) => item.label === 'CurrentUser').placement,
    '@CurrentUser',
  );
  const storage = pipeline.find(
    (item) => item.className === 'RedisThrottlerStorage',
  );
  assert.equal(storage?.functionName, 'increment');
  const throttleConfig = pipeline
    .find((item) => item.label === 'ThrottlerModule configuration')
    .lines.join('\n');
  assert.ok(throttleConfig.includes("config.getOrThrow('THROTTLE_STORAGE'"));
  assert.ok(throttleConfig.includes('...(sharedStorage'));
});

test('cookie auth route resolves its real route-scoped guard and class Public decorator', () => {
  const pipeline = endpoint('auth', 'AuthController', 'refresh');
  assert.ok(
    pipeline.some(
      (item) =>
        item.className === 'CsrfGuard' &&
        item.functionName === 'canActivate' &&
        item.placement === '@UseGuards',
    ),
  );
  assert.ok(
    pipeline.some(
      (item) =>
        item.label === 'Public' &&
        item.lines.join('\n').includes('SetMetadata(IS_PUBLIC_KEY, true)'),
    ),
  );
  assert.ok(pipeline.some((item) => item.className === 'JwtAuthGuard'));
});

test('UUID parameter includes the actual Nest configuration and source provenance', () => {
  const pipeline = endpoint('calling', 'CallingController', 'join');
  const uuid = pipeline.find(
    (item) => item.label === 'ParseUUIDPipe configuration',
  );
  assert.ok(uuid);
  assert.ok(uuid.lines.join('\n').includes('ParseUUIDPipe'));
  assert.equal(uuid.placement, '@Param');
  for (const item of pipeline) {
    assert.equal(item.tag, 'CONTROLLER');
    assert.ok(item.sourceStart > 0 && item.sourceEnd >= item.sourceStart);
    const source = readFileSync(item.file, 'utf8').split(/\r?\n/);
    assert.ok(item.sourceEnd <= source.length);
  }
});

test('invalid endpoint fails explicitly instead of inventing request hooks', () => {
  assert.throws(
    () => endpoint('auth', 'AuthController', 'missingEndpoint'),
    /Cannot resolve request endpoint/,
  );
});
