# `@litmatch/api-client`

Browser-safe client cho Core API:

- `src/generated/core-api.ts` được sinh từ `openapi/core-api.json`; không sửa tay.
- `ApiClient` xử lý base URL, access token, cookie refresh/CSRF và idempotency contract.
- `ApiError` giữ status/code/trace metadata cho UI.

```bash
pnpm openapi:sync
pnpm openapi:check
pnpm nx test api-client
pnpm nx lint api-client
pnpm nx build api-client
```

Frontend không tự định nghĩa lại DTO hoặc gọi REST bằng fetch/axios ngoài client boundary.
