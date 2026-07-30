# Core API E2E

Nx project cho HTTP end-to-end smoke của Core API. Đây là test harness, không phải deployable.

```bash
pnpm nx e2e core-api-e2e
pnpm nx lint core-api-e2e
pnpm nx show project core-api-e2e --json
```

Suite cần app/database theo target configuration và phải fail nhanh khi app không boot. Test
business nhạy cảm vẫn cần integration suite của module trên PostgreSQL/Redis thật khi scope yêu cầu.
