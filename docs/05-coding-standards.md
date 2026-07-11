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

Mỗi module nghiệp vụ khác (auth, user, social, content, moderation, notification, gift) đi theo đúng bộ khung `*.controller.ts / *.service.ts / *.module.ts / dto/ / entities/ / events/` như ví dụ `matching/` ở trên. **Sinh module mới bằng skill `/new-module`** — thứ tự sinh file cố định + tự nối vào các mảnh khung dùng chung:

- `BaseAppEntity` (`src/common/entities/base.entity.ts`): uuid PK + createdAt/updatedAt — opt-in, entity có PK nghiệp vụ riêng hoặc bảng append-only thì tự khai cột.
- `@IdempotencyKey()` + `@ApiIdempotencyKeyHeader()` (`src/common/decorators/idempotency-key.decorator.ts`): chuẩn duy nhất để nhận idempotency key ở controller — validate bắt buộc + độ dài, service chỉ còn lo prefix theo domain + unique constraint DB.
- `CursorPageQueryDto` / `encodeCursor` / `decodeCursor` / `buildCursorPage` (`@litmatch/common-dtos`): chuẩn duy nhất cho list cursor-based — query `limit + 1` rồi đưa qua `buildCursorPage`.
- `DomainException` + `<Module>Errors` trong `*.errors.ts` (`@litmatch/common-exceptions`).

Khung chỉ cứng ở tầng hình thái này — business logic trong service tự do, không abstract hoá nghiệp vụ.

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

- Coverage đích **80% cho service layer**, enforce bằng `coverageThreshold` trong `apps/core-api/jest.config.cts` chạy ở CI với `--coverage` — ngưỡng là **ratchet chỉ nâng không hạ** (sàn hiện tại thấp hơn 80 vì `iap-refund-poll`/`outbox-relay` chưa có test, xem comment trong file config; bổ sung test thì nâng ngưỡng lên trong cùng PR). Lưu ý: đo coverage phải kèm `INTEGRATION_DB_URL` (Economy test chủ yếu là integration) và `--skip-nx-cache` khi cần số thật. Riêng Economy/Matching bắt buộc thêm **test race-condition** (2 request song song cùng trừ tiền / cùng lấy 1 user khỏi queue) — xem [10-code-review-checklist.md § 10.1.E](./10-code-review-checklist.md).
- e2e bắt buộc cho: mua diamond, gift, matching → call → billing, refund/reversal (chạy với Postgres/Redis thật qua testcontainers hoặc docker-compose CI).
- Event schema có field `version`; consumer phải chịu được version cũ — thêm field là non-breaking, đổi/xoá field phải lên version mới.
- Commit theo Conventional Commits, scope là tên module: `feat(economy): ...`, `fix(matching): ...`.

## 5.10 Idempotency & ghi tiền (convention dùng chung, không riêng Economy)

Áp dụng cho **mọi** thao tác có tác dụng phụ không được lặp: trừ/cộng diamond, đặt match ticket, tặng quà, settle call, claim thưởng. Economy chỉ là nơi áp dụng đầu tiên và kỹ nhất ([services/economy-service.md § 3](./services/economy-service.md)).

- **Idempotency key là unique constraint ở DB**, không bao giờ check-rồi-insert bằng code (check-then-act vẫn có race). Luồng chuẩn: cố `INSERT` → bắt **unique violation** → đọc lại row đã tồn tại → xử lý theo trạng thái của nó, KHÔNG tạo bản ghi thứ 2.
- **2 request song song cùng key** (request đầu chưa commit): request sau bắt unique violation *trước* khi request đầu xong → **retry đọc ngắn có backoff** tới khi row hiện trạng thái cuối, rồi trả kết quả cũ. Không được tự tạo giao dịch mới.
- **Cùng key nhưng payload khác** (`request_hash` khác) → trả 409 `*_IDEMPOTENCY_CONFLICT` (lỗi client, không phải retry).
- **Check + hành động luôn atomic**: gộp trong 1 DB transaction với `SELECT ... FOR UPDATE` (hoặc optimistic lock), xác minh lại điều kiện (số dư, quyền, trạng thái) **tại thời điểm hành động**, không tin giá trị đọc trước đó ([10 § 10.0.C](./10-code-review-checklist.md)).
- **Không diễn giải lại giao dịch cũ theo config hiện tại**: giá/tỉ lệ áp dụng phải snapshot vào bản ghi giao dịch (versioned pricing), đọc lại từ snapshot đó — đổi giá không bao giờ đụng giao dịch đã ghi.

---
[← 04 · Tech Stack](./04-tech-stack.md) · [06 · Domain Rules →](./06-domain-rules.md)
