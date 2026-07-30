import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { projectTagErrors } from './project-tags.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);

function repositoryProjects(directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (IGNORED_DIRECTORIES.has(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return repositoryProjects(path);
    return entry.name === 'project.json' && existsSync(path) ? [path] : [];
  });
}

test('mọi project khai đủ type, scope và platform capability', () => {
  const errors = repositoryProjects().flatMap((projectPath) => {
    const project = JSON.parse(readFileSync(projectPath, 'utf8'));
    return projectTagErrors({
      projectPath: relative(root, projectPath).replaceAll('\\', '/'),
      tags: project.tags,
    });
  });

  assert.deepEqual(errors, []);
});

test('phát hiện project thiếu platform capability', () => {
  assert.match(
    projectTagErrors({
      projectPath: 'libs/example/project.json',
      tags: ['type:lib', 'scope:shared'],
    }).join('\n'),
    /thiếu tag capability/u,
  );
});

test('phát hiện platform không hợp lệ và runtime lệch scope', () => {
  const errors = projectTagErrors({
    projectPath: 'apps/example/project.json',
    tags: ['type:app', 'scope:core', 'platform:browser', 'platform:edge'],
  }).join('\n');

  assert.match(errors, /platform tag không hợp lệ/u);
  assert.match(errors, /server-compatible/u);
});

test('phát hiện project nằm ngoài apps/ và libs/', () => {
  assert.match(
    projectTagErrors({
      projectPath: 'services/example/project.json',
      tags: ['type:app', 'scope:core', 'platform:server'],
    }).join('\n'),
    /phải nằm trực tiếp/u,
  );
});

test('cho phép library có cả browser và server capability', () => {
  assert.deepEqual(
    projectTagErrors({
      projectPath: 'libs/contracts/project.json',
      tags: ['type:lib', 'scope:shared', 'platform:browser', 'platform:server'],
    }),
    [],
  );
});
