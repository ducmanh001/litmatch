'use strict';

const path = require('node:path');
const { register } = require('tsconfig-paths');

const workspaceRoot = path.resolve(__dirname, '..');
const tsconfig = require(path.join(workspaceRoot, 'tsconfig.base.json'));

register({
  baseUrl: workspaceRoot,
  paths: tsconfig.compilerOptions?.paths ?? {},
});
