import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  fullSteps,
  sha256,
  simplifyEndpoint,
  splitBody,
} from './presentation-pages.mjs';

function fixture() {
  const body =
    '// [CONTROLLER] Controller.join · controller.ts L1–5\nclass Controller {\n  constructor(private service: Service) {}\n  // Step 1: Read user and\n  // validate room before joining\n  // This following why comment is not part of the Step\n  const result = await this.service.join(user, id);\n  // [SERVICE] Service.join · service.ts L20–30\n  const roomId = id;\n  // Step 2: Return result\n  return result;\n}\n';
  const source =
    '//  POST /rooms\n//  Join room\n// Luồng: CONTROLLER → SERVICE\n// Bảng: rooms — state\n// Cách đọc: flattened\n\n' +
    body;
  const lines = source.trimEnd().split('\n');
  const html =
    '<html><head></head><body><div class="actions"></div><span class="meta">' +
    lines.length +
    ' dòng · litmatch @ abc1234</span><div class="src">\n' +
    lines
      .map(
        (line, i) =>
          '<div class="ln code' +
          (line.includes('const roomId') ? ' syn synfirst' : '') +
          '" id="L' +
          (i + 1) +
          '"><a class="n" href="#L' +
          (i + 1) +
          '" data-n="' +
          (i + 1) +
          '"></a><span class="t">' +
          line
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;') +
          '</span></div>',
      )
      .join('\n') +
    '\n</div></body></html>';
  const endpoint = {
    n: '01',
    slug: 'join',
    method: 'POST',
    route: '/rooms',
    title: 'Join room',
    steps: [
      { text: 'Read user and validate room before joining' },
      { text: 'Return result' },
    ],
    items: [{ file: 'controller.ts' }, { file: 'service.ts' }],
  };
  return { source, html, endpoint, body };
}

test('removes overview while preserving the approved body, bindings and full wrapped Steps', () => {
  const { source, html, endpoint, body } = fixture();
  const result = simplifyEndpoint(source, html, { id: 'party' }, endpoint);
  assert.equal(splitBody(result.source).body, body);
  assert.equal(result.manifest.bodySha256, sha256(body));
  assert.deepEqual(result.synthetic, ['const roomId = id;']);
  assert.deepEqual(result.manifest.steps, [
    'Step 1: Read user and validate room before joining',
    'Step 2: Return result',
  ]);
  assert.ok(result.manifest.removedOverview.includes('Bảng: rooms'));
  assert.doesNotMatch(
    result.source.slice(0, splitBody(result.source).first),
    /Luồng|Bảng|Cách đọc/,
  );
  assert.ok(result.html.includes('../../ai/flows/party/01-join.json'));
  assert.ok(result.html.includes('../../ai/index.html'));
});

test('renumbers all rendered source anchors and summary links to body Step locations', () => {
  const { source, html, endpoint } = fixture();
  const result = simplifyEndpoint(source, html, { id: 'party' }, endpoint);
  const lines = result.source.trimEnd().split('\n');
  const ids = [...result.html.matchAll(/id="L(\d+)"/g)].map((m) =>
    Number(m[1]),
  );
  assert.deepEqual(
    ids,
    lines.map((_, i) => i + 1),
  );
  for (const n of [1, 2]) {
    const line =
      lines.findIndex((l) => new RegExp('^\\s*// Step ' + n + ':').test(l)) + 1;
    assert.ok(result.html.includes('class="step-link" href="#L' + line + '"'));
  }
});

test('fails on missing or ambiguous catalog Steps instead of silently truncating text', () => {
  assert.throws(
    () => fullSteps('// Step 1: Unknown', { steps: [{ text: 'Other' }] }),
    /Cannot resolve/,
  );
  assert.throws(
    () =>
      fullSteps('// Step 1: Shared', {
        steps: [{ text: 'Shared one' }, { text: 'Shared two' }],
      }),
    /Cannot resolve/,
  );
  assert.throws(
    () =>
      fullSteps('// Step 1: One', {
        steps: [{ text: 'One' }, { text: 'Two' }],
      }),
    /Every catalog Step/,
  );
});
