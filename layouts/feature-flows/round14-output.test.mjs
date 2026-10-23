import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { baselineDir, splitBody, sha256 } from './presentation-pages.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
test('all published endpoint artifacts have complete Steps and preserve the selected authoring mode', async () => {
  let endpoints = 0;
  for (const file of readdirSync(here).filter(
    (f) => /^annotated-.+\.mjs$/.test(f) && f !== 'annotated-source.mjs',
  )) {
    for (const feature of (
      await import(pathToFileURL(path.join(here, file)).href)
    ).annotatedFeatures) {
      for (const endpoint of feature.endpoints) {
        endpoints += 1;
        const base = path.join(
          here,
          'code',
          feature.id,
          `${endpoint.n}-${endpoint.slug}`,
        );
        const source = readFileSync(`${base}.ts`, 'utf8');
        const manifest = JSON.parse(
          readFileSync(`${base}.sources.json`, 'utf8'),
        );
        const summary = source
          .split('\n')
          .filter((l) => l.startsWith('//  Step '))
          .map((l) => l.slice(4));
        assert.deepEqual(summary, manifest.steps, base);
        if (manifest.mode === 'published-presentation') {
          const baseline = readFileSync(
            path.join(
              baselineDir,
              'code',
              feature.id,
              `${endpoint.n}-${endpoint.slug}.ts`,
            ),
            'utf8',
          );
          assert.equal(splitBody(source).body, splitBody(baseline).body, base);
          assert.equal(sha256(source), manifest.codeSha256, base);
          assert.equal(manifest.bodySha256, manifest.baselineBodySha256, base);
          continue;
        }
        assert.equal(
          (source.match(/^\s*constructor\(/gm) ?? []).length,
          1,
          base,
        );
        assert.ok(
          source.indexOf('constructor(') <
            source.indexOf('// [CONTROLLER] app.use'),
          base,
        );
        assert.doesNotMatch(source, /^\s*\/\/ \[[A-Z]+\].*\.ts L\d/gm, base);
        assert.equal(
          manifest.expanded.length,
          new Set(manifest.expanded).size,
          base,
        );
        assert.ok(
          manifest.sources.includes(
            'apps/core-api/src/common/guards/jwt-auth.guard.ts',
          ),
          base,
        );
        assert.ok(
          manifest.sources.includes(
            'apps/core-api/src/common/filters/global-exception.filter.ts',
          ),
          base,
        );
      }
    }
  }
  assert.equal(endpoints, 25);
});

test('Party Room reaches infrastructure and evaluates argument helpers before invoking the callee', () => {
  const source = readFileSync(
    path.join(here, 'code/04-party-room/01-post-join-room.ts'),
    'utf8',
  );
  const manifest = JSON.parse(
    readFileSync(
      path.join(here, 'code/04-party-room/01-post-join-room.sources.json'),
      'utf8',
    ),
  );
  if (manifest.mode === 'published-presentation') {
    const baseline = readFileSync(
      path.join(baselineDir, 'code/04-party-room/01-post-join-room.ts'),
      'utf8',
    );
    assert.equal(splitBody(source).body, splitBody(baseline).body);
    return;
  }
  for (const name of [
    'PartyRoomService.joinRoom',
    'LivekitPartyRoomAdapter.mintJoinToken',
    'LivekitSdkClient.mintJoinToken',
    'RedisRealtimePublisher.publish',
  ])
    assert.ok(source.includes(name), name);
  const helper = source.indexOf('// [SERVICE] realtimeUserChannel');
  const publisher = source.indexOf('// [REDIS] RedisRealtimePublisher.publish');
  if (helper >= 0) assert.ok(helper < publisher);
  else
    assert.ok(
      source.indexOf(
        'const channel = `${REALTIME_USER_CHANNEL_PREFIX}${userId}`;',
      ) > publisher,
    );
  const constructor = source.slice(
    source.indexOf('constructor('),
    source.indexOf('// Step 1:'),
  );
  assert.doesNotMatch(
    constructor,
    /:\s*(PartyRoomService|LivekitPartyRoomPort|RealtimePublisherPort)/,
  );
  assert.ok(constructor.includes("config.getOrThrow('LIVEKIT_API_KEY'"));
});
