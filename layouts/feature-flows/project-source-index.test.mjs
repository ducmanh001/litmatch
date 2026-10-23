import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createProjectIndex } from './project-source-index.mjs';

test('resolves imported helpers, aliased ports, inherited methods and function fields without confusing SDK calls', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'litmatch-index-'));
  try {
    const app = path.join(root, 'apps/core-api');
    mkdirSync(path.join(app, 'src'), { recursive: true });
    writeFileSync(
      path.join(app, 'tsconfig.app.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2022', strict: true },
        include: ['src/*.ts'],
      }),
    );
    writeFileSync(
      path.join(app, 'src/port.ts'),
      'export abstract class Port { abstract send(value: string): void; }\nexport function helper(value: string) { return value.trim(); }',
    );
    writeFileSync(
      path.join(app, 'src/adapter.ts'),
      `import { Port as PortAlias } from './port';
      class Base { common() { return 'base'; } }
      export class Adapter extends PortAlias { send(value: string) { return value; } }
      export class Child extends Base { field = () => { return this.common(); }; }
    `,
    );
    writeFileSync(
      path.join(app, 'src/main.ts'),
      `import { Port, helper as imported } from './port';
      import { Child } from './adapter';
      declare const sdk: { send(value: string): void };
      export class Main {
        constructor(private port: Port, private child: Child) {}
        run() { this.port.send(imported('x')); this.child.field(); sdk.send('external'); this.same(); this.same(); }
        same() { return 1; }
      }`,
    );
    const index = createProjectIndex(root);
    const main = index.functions.find(
      (n) => n.className === 'Main' && n.name === 'run',
    );
    const calls = index.calls(main);
    const names = (expr) =>
      calls
        .find((c) => c.expression === expr)
        .targets.map((n) => `${n.className ?? ''}.${n.name}`);
    assert.deepEqual(names('this.port.send'), ['Adapter.send']);
    assert.deepEqual(names('imported'), ['.helper']);
    assert.deepEqual(names('this.child.field'), ['Child.field']);
    assert.deepEqual(names('sdk.send'), []);
    assert.equal(calls.filter((c) => c.expression === 'this.same').length, 2);
    const arrow = index.functions.find(
      (n) => n.className === 'Child' && n.name === 'field',
    );
    assert.deepEqual(
      index
        .calls(arrow)
        .find((c) => c.expression === 'this.common')
        .targets.map((n) => `${n.className}.${n.name}`),
      ['Base.common'],
    );
    assert.equal(
      index.isProjectDependency('apps/core-api/src/main.ts', 'Main', 'port'),
      true,
    );
    assert.equal(index.isProjectType('Port'), true);
    assert.equal(index.isProjectType('Repository'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
