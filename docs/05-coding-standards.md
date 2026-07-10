[← 04 · Tech Stack](./04-tech-stack.md) · **05 · Coding Standards** · [06 · Domain Rules →](./06-domain-rules.md)

# 5. Coding Standard (NestJS) — tuân theo xuyên suốt, mọi module, mọi giai đoạn

## 5.1 Nguyên tắc chung
- **Không hardcode**: mọi config (port, DB url, secret, giá diamond, thời lượng free call, tỉ lệ quy đổi VIP...) đưa vào `.env` + `ConfigModule`, validate bằng `Joi`.
- **Layer rõ ràng**: `Controller` → `Service` → `Repository`. Controller không gọi thẳng Repository.
- **DTO + class-validator** cho mọi input/output, không nhận `any`.
- **Dependency Injection** triệt để.
- **Module hoá theo domain**, không import chéo lung tung giữa module.
- **Error handling chuẩn hoá**: `DomainException` base class + global `ExceptionFilter`, format lỗi thống nhất (code, message, traceId).
- **Idempotency bắt buộc** cho mọi API động tới diamond (idempotencyKey).
- **Transaction DB bắt buộc** cho mọi thao tác trừ/cộng diamond (`SELECT FOR UPDATE` hoặc optimistic lock) — chỗ hay bug nhất trong toàn hệ thống.
- **Test bắt buộc**: unit test Service (Jest), e2e test cho flow quan trọng (matching → call → billing, mua diamond → nhận gift).
- **Lint/format**: ESLint + Prettier + Husky pre-commit.

## 5.2 NestJS lifecycle convention
- Dùng đúng lifecycle hook (`OnModuleInit`, `OnApplicationBootstrap`) để khởi tạo kết nối Redis/Kafka.
- `Guard` cho auth/permission, `Interceptor` cho logging/transform response, `Pipe` cho validate.
- Config qua `ConfigService`, không dùng `process.env` trực tiếp trong business logic.

## 5.3 Cấu trúc thư mục (ví dụ trong `apps/core-api`)
```
src/
 |-- modules/
 |    |-- matching/
 |    |    |-- matching.controller.ts
 |    |    |-- matching.service.ts
 |    |    |-- matching.module.ts
 |    |    |-- dto/
 |    |    |-- entities/       (MatchTicket, MatchQueue, MatchSession)
 |    |    `-- events/
 |    `-- economy/
 |         |-- economy.controller.ts
 |         |-- economy.service.ts       (tính toán/derive Wallet snapshot)
 |         |-- ledger.service.ts        (ghi bút toán Nợ/Có, chỉ append)
 |         |-- economy.module.ts
 |         |-- dto/
 |         `-- entities/       (LedgerEntry, Wallet, Transaction)
 |-- common/
 |    |-- filters/
 |    |-- interceptors/
 |    |-- guards/
 |    `-- decorators/
 |-- config/
 `-- main.ts
```

Mỗi module nghiệp vụ khác (auth, user, social, content, moderation, notification, gift) đi theo đúng bộ khung `*.controller.ts / *.service.ts / *.module.ts / dto/ / entities/ / events/` như ví dụ `matching/` ở trên.

## 5.4 API contract

- REST, version trong URI ngay từ đầu: `api/v1/...` (URI versioning của NestJS) — đổi breaking thì lên `v2`, không sửa ngầm `v1`.
- Response envelope thống nhất: thành công `{ "data": ..., "meta": {...} }`; lỗi `{ "error": { "code", "message", "traceId" } }` (khớp § 5.1). Không endpoint nào trả object trần một kiểu riêng.
- Pagination: **cursor-based** cho mọi list lớn dần vô hạn (feed, lịch sử giao dịch, message): query `?limit=&cursor=`, response `meta.nextCursor`. Offset-based chỉ dùng cho danh sách admin nhỏ.
- Idempotency key truyền qua header `Idempotency-Key`, không nhét vào body.
- OpenAPI (`@nestjs/swagger`) bắt buộc: decorator viết ngay cùng lúc với endpoint, không bổ sung sau.

## 5.5 Error taxonomy

- Mã lỗi dạng `DOMAIN_SUBJECT_REASON` (UPPER_SNAKE): `ECONOMY_WALLET_INSUFFICIENT_BALANCE`, `MATCHING_TICKET_ALREADY_QUEUED`, `AUTH_TOKEN_EXPIRED`.
- Mỗi module có 1 file `*.errors.ts` liệt kê toàn bộ mã lỗi của module — không sinh mã lỗi rải rác trong service.
- 4xx cho lỗi client/nghiệp vụ (validate, quyền, trạng thái không cho phép); 5xx chỉ cho lỗi hệ thống — `DomainException` không bao giờ map ra 500.
- `traceId` lấy từ OpenTelemetry context (fallback: UUID sinh tại entry request), trả trong mọi error response và ghi kèm mọi log line của request đó.

## 5.6 Naming convention

- File: kebab-case chuẩn NestJS (`matching.service.ts`, `match-ticket.entity.ts`); class PascalCase; hằng số UPPER_SNAKE.
- DB: bảng snake_case số nhiều (`ledger_entries`, `match_tickets`), cột snake_case — map qua naming strategy của TypeORM, không đặt tên cột camelCase trong DB.
- Event (nội bộ + Kafka): `<domain>.<subject>.<động-từ-quá-khứ>` — vd `economy.diamond.deducted`, `matching.pair.confirmed`, `call.session.ended`.
- Kafka topic theo domain: `litmatch.<domain>.events`; consumer group theo app + module: `core-api.notification`.
- Env var: UPPER_SNAKE có prefix domain — `ECONOMY_FREE_CALL_SECONDS`, `MATCHING_SPEEDUP_PRICE_DIAMOND`.

## 5.7 Logging & observability

- Structured JSON log (pino qua logger lib chung ở `libs/logger`) — cấm `console.log`. Mỗi line tối thiểu: timestamp, level, context (module), traceId, message.
- **Cấm log PII/secret**: token, password, OTP, receipt IAP, nội dung tin nhắn, số dư gắn kèm danh tính đầy đủ — danh sách field cấm log (redact list) đặt tập trung trong `libs/logger`, không tự nhớ ở từng chỗ.
- Metrics Prometheus đặt tên `<domain>_<subject>_<đơn_vị>`: `matching_queue_wait_seconds`, `economy_ledger_write_failures_total`.
- Audit log cho hành động nhạy cảm ([06-domain-rules.md](./06-domain-rules.md)) là **bảng DB append-only** (dữ liệu nghiệp vụ), không phải log text.

## 5.8 Security baseline

- `helmet` + CORS allowlist theo env (cấm `*` ở production); rate limit mặc định bằng `@nestjs/throttler` + limit riêng chặt hơn cho login/OTP, report, gift, vào queue matching.
- `ClassSerializerInterceptor` global + `@Exclude` mặc định cho field nhạy cảm trong entity (password hash, refresh token, dữ liệu người khác) — output qua DTO tường minh, không trả entity trần.
- Secret chỉ qua env/secret manager, không commit; `.env.example` luôn đủ key (không chứa giá trị thật).
- Mọi resource gắn userId phải check ownership tại server (chống IDOR — [10-code-review-checklist.md § 10.1.D](./10-code-review-checklist.md)).

## 5.9 Testing & git convention

- Coverage tối thiểu **80% cho service layer** (gate ở CI); riêng Economy/Matching bắt buộc thêm **test race-condition** (2 request song song cùng trừ tiền / cùng lấy 1 user khỏi queue) — xem [10-code-review-checklist.md § 10.1.E](./10-code-review-checklist.md).
- e2e bắt buộc cho: mua diamond, gift, matching → call → billing, refund/reversal (chạy với Postgres/Redis thật qua testcontainers hoặc docker-compose CI).
- Event schema có field `version`; consumer phải chịu được version cũ — thêm field là non-breaking, đổi/xoá field phải lên version mới.
- Commit theo Conventional Commits, scope là tên module: `feat(economy): ...`, `fix(matching): ...`.

---
[← 04 · Tech Stack](./04-tech-stack.md) · [06 · Domain Rules →](./06-domain-rules.md)
