module.exports = {
  displayName: 'core-api',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/core-api',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test-setup.ts'],
  // Gate coverage cho service layer (docs/05 § 5.9 — đích 80%, gate ratchet chỉ nâng không hạ).
  // Ngưỡng chỉ được enforce khi chạy với --coverage (CI luôn bật) và phải kèm
  // INTEGRATION_DB_URL (Economy test chủ yếu là integration; thiếu env này coverage tụt ~26 điểm).
  // Sàn hiện tại đo 2026-07-12: stmts 69.5 / branch 68.3 / funcs 63.6 / lines 71.7 —
  // thiếu do iap-refund-poll.service.ts & outbox-relay.service.ts chưa có test; viết xong thì nâng lên 80.
  collectCoverageFrom: ['src/modules/**/*.service.ts'],
  coverageThreshold: {
    global: { statements: 68, branches: 65, functions: 60, lines: 70 },
  },
};
