# Signaling Gateway E2E

Nx project cho HTTP/WebSocket end-to-end smoke của Signaling Gateway. Đây là test harness, không
phải deployable.

```bash
pnpm nx e2e signaling-gateway-e2e
pnpm nx lint signaling-gateway-e2e
pnpm nx show project signaling-gateway-e2e --json
```

Gateway behavior nhiều replica/Redis adapter còn có integration test trong project
`signaling-gateway`; chọn suite theo failure boundary cần chứng minh.
