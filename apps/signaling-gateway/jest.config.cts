const path = require('node:path');
const tsJest = 'ts-jest';
const { resolver: _nxResolver, ...nxPreset } = require('../../jest.preset.js');

module.exports = {
  ...nxPreset,
  // Keep Jest's root at the workspace so pnpm's root-level node_modules is resolvable on Windows.
  rootDir: path.resolve(__dirname, '../..'),
  roots: [path.resolve(__dirname, 'src')],
  moduleDirectories: ['node_modules'],
  resolver: path.resolve(__dirname, '../../scripts/jest/resolver.cjs'),
  transform: {
    '^.+\\.(ts|js|mts|mjs|cts|cjs|html)$': [
      tsJest,
      { tsconfig: path.resolve(__dirname, 'tsconfig.spec.json') },
    ],
  },
  displayName: 'signaling-gateway',
  testEnvironment: 'node',
  coverageDirectory: '../../coverage/apps/signaling-gateway',
};
