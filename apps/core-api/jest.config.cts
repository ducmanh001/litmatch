module.exports = {
  displayName: 'core-api',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/core-api',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test-setup.ts'],
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
