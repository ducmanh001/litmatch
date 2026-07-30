# `@litmatch/browser-auth`

Adapters browser cho Google Identity Services và Facebook SDK. Library chỉ normalize provider
token/callback lifecycle; Core API vẫn verify identity và quyết định session.

```bash
pnpm nx test browser-auth
pnpm nx lint browser-auth
pnpm nx build browser-auth
```

Provider readiness/client ID lấy từ runtime capability contract. Adapter không được tự coi build
env có giá trị là provider đã sẵn sàng production.
