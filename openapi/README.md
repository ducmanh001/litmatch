# OpenAPI contract

`core-api.json` là REST contract được emit từ decorators/DTO của Core API. Nó là source cho
`libs/api-client/src/generated/core-api.ts`, không phải file thiết kế API độc lập để sửa tay.

```bash
pnpm openapi:emit
pnpm openapi:gen
pnpm openapi:sync
pnpm openapi:check
```

Workflow thay contract:

1. Sửa controller/DTO/source owner.
2. Chạy `pnpm openapi:sync`.
3. Review diff của JSON và generated TypeScript.
4. Chạy frontend/API checks áp dụng.

Critical multi-step REST flow được mô tả ở `specs/critical-workflows.arazzo.yaml`; realtime event
không thuộc OpenAPI.
