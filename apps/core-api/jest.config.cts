module.exports = {
  displayName: 'core-api',
  preset: '../../jest.preset.js',
  coverageDirectory: '../../coverage/apps/core-api',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/test-setup.ts'],
  // Gate coverage cho service layer (docs/05 § 5.9 — đích 80%, gate ratchet chỉ nâng không hạ).
  // Ngưỡng chỉ được enforce khi chạy với --coverage (CI luôn bật) và phải kèm
  // INTEGRATION_DB_URL (Economy test chủ yếu là integration; thiếu env này coverage tụt ~26 điểm).
  // Sàn hiện tại đo 2026-07-12 (sau Matching M1): stmts 80.6 / branch 73.1 / funcs 68.4 / lines 83.4 —
  // phần thiếu còn lại do iap-refund-poll.service.ts & outbox-relay.service.ts chưa có test; viết xong thì nâng tiếp.
  collectCoverageFrom: ['src/modules/**/*.service.ts'],
  coverageThreshold: {
    global: { statements: 78, branches: 71, functions: 66, lines: 81 },
  },
};
