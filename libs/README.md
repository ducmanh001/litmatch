# Shared libraries

Nx libraries chỉ chứa contract/infrastructure thực sự dùng chung. Không chuyển business logic ra
lib để né module boundary của `core-api`.

| Library                                              | Trách nhiệm                                                          |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [`api-client`](./api-client/README.md)               | Generated REST types, client, auth refresh/idempotency và `ApiError` |
| [`browser-auth`](./browser-auth/README.md)           | Browser adapters cho Google/Facebook identity SDK                    |
| [`common-dtos`](./common-dtos/README.md)             | Cross-app DTO/type và realtime event names                           |
| [`common-exceptions`](./common-exceptions/README.md) | `DomainException` và error contract                                  |
| [`config-validator`](./config-validator/README.md)   | Shared Joi helpers cho typed env                                     |
| [`e2e-support`](./e2e-support/README.md)             | Reusable E2E startup/config helpers                                  |
| [`logger`](./logger/README.md)                       | Pino logger/redaction bootstrap                                      |
| [`observability`](./observability/README.md)         | OTel/Sentry metrics, tracing và error instrumentation                |

Xem dependency/tags thật bằng:

```bash
pnpm nx show project <library> --json
pnpm nx graph
```

Public export phải qua `src/index.ts`; consumer khai workspace dependency thật, không patch
`tsconfig.paths` để vượt package boundary.
