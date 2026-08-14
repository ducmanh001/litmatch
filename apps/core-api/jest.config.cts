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
  displayName: 'core-api',
  coverageDirectory: '../../coverage/apps/core-api',
  testEnvironment: 'node',
  setupFiles: [path.resolve(__dirname, 'src/test-setup.ts')],
  // Integration suites reset the same PostgreSQL test schema and reserved Redis databases.
  // Running test files in parallel makes those resets race and produces nondeterministic CI.
  maxWorkers: 1,
  // Gate coverage cho service layer (docs/05 § 5.9 — đích 80%, gate ratchet chỉ nâng không hạ).
  // Ngưỡng chỉ được enforce khi chạy với --coverage (CI luôn bật) và phải kèm
  // INTEGRATION_DB_URL (Economy test chủ yếu là integration; thiếu env này coverage tụt ~26 điểm).
  // Baseline đo 2026-07-13 trên Postgres thật: stmts 86.35 / branch 79.76 / funcs 76.62 /
  // lines 87.49. Threshold giữ một khoảng nhỏ chống dao động instrumentation nhưng chỉ được nâng,
  // không được hạ khi thêm code mới.
  collectCoverageFrom: ['src/modules/**/*.service.ts'],
  coverageThreshold: {
    global: { statements: 84, branches: 78, functions: 74, lines: 85 },
  },
};
