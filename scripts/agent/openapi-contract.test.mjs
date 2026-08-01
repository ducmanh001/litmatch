import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const document = JSON.parse(
  readFileSync(`${root}/openapi/core-api.json`, 'utf8'),
);

const HTTP_METHODS = [
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
];

function queryParameters(path) {
  return Object.entries(document.paths).flatMap(([pathName, pathItem]) =>
    HTTP_METHODS.flatMap((method) =>
      pathName === path && pathItem[method]?.parameters
        ? pathItem[method].parameters
            .filter((parameter) => parameter.in === 'query')
            .map((parameter) => ({ path: pathName, ...parameter }))
        : [],
    ),
  );
}

test('admin offset pagination is emitted as numeric query parameters', () => {
  for (const path of ['/api/v1/admin/users', '/api/v1/admin/reports']) {
    const parameters = queryParameters(path);
    const byName = new Map(
      parameters.map((parameter) => [parameter.name, parameter]),
    );

    for (const name of ['limit', 'offset']) {
      assert.equal(byName.get(name)?.schema?.type, 'number', `${path} ${name}`);
    }
  }
});

test('query parameters do not fall back to an empty Object schema', () => {
  const violations = [];

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      for (const parameter of pathItem[method]?.parameters ?? []) {
        if (
          parameter.in === 'query' &&
          parameter.schema?.allOf?.length === 1 &&
          parameter.schema.allOf[0]?.$ref === '#/components/schemas/Object'
        ) {
          violations.push(`${method.toUpperCase()} ${path} ${parameter.name}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});
