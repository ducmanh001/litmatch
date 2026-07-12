[← 04 · Tech Stack](./04-tech-stack.md) · **05 · Coding Standards** · [06 · Domain Rules →](./06-domain-rules.md)

# 5. Coding Standard (NestJS) — tuân theo xuyên suốt, mọi module, mọi giai đoạn

## 5.1 Nguyên tắc chung

- **Single source of truth cho MỌI giá trị lặp lại hoặc có thể lệch** (nguyên tắc gốc — các mục dưới đây, § 5.2 `ConfigService`, và `docs/10 § 10.1.G` chỉ là các trường hợp cụ thể của đúng 1 nguyên tắc này, đọc nguyên tắc này trước khi thêm case mới thay vì tự suy luận lại từ đầu). Gặp 1 giá trị (số, chuỗi, URL, tên field/key...) xuất hiện hoặc CÓ THỂ xuất hiện ≥ 2 chỗ, hoặc là hằng số/cấu hình do bên ngoài code quyết định — luôn tự hỏi theo đúng thứ tự:
  1. **Framework/library đang dùng đã có sẵn hằng số/enum/type cho đúng giá trị này chưa** (vd `HttpStatus`, `ConfigService<K>` generic)? Có → dùng thẳng, không tự viết tay/tự định nghĩa lại (`docs/10 § 10.1.G`).
  2. **Giá trị có thực sự khác nhau giữa dev/staging/production, hoặc là secret/giá trị nghiệp vụ có thể đổi (giá, thời lượng, ngưỡng)** không? Có → `.env` + `ConfigModule`, validate bằng `Joi`, khai kiểu trong `CoreApiEnv` (`docs/05 § 5.2`) — KHÔNG hardcode trong code (port, DB url, secret, giá diamond, thời lượng free call, tỉ lệ quy đổi VIP...).
  3. Nếu KHÔNG (hằng số cố định của 1 tích hợp bên thứ 3 — URL API, JWKS endpoint, issuer OIDC, mã status của chính bên đó... — không đổi theo môi trường, đưa vào `.env` chỉ tạo cấu hình giả không ai đổi thật): đặt tên rõ thành 1 constant, vị trí theo **ngữ nghĩa, KHÔNG theo số nơi đang dùng — không đợi có nơi dùng thứ 2 mới tách** (tách sau = thêm 1 lần refactor + trong lúc chưa tách thì nơi dùng mới không biết hằng đã tồn tại, tự khai trùng):
     - Hằng có ngữ nghĩa vượt ra ngoài 1 file (endpoint/status/scope bên thứ 3, tham số sản phẩm/bảo mật như độ dài OTP/entropy token, định danh DB constraint/Kafka topic/prefix key) → `<module>.constants.ts` NGAY TỪ ĐẦU, kể cả khi mới 1 chỗ dùng (vd `economy.constants.ts`, `auth.constants.ts`, `matching.constants.ts`).
     - Thuộc về ≥2 module hoặc là hạ tầng chung → `src/common/constants/` (vd `oauth-providers.constants.ts`) hoặc `src/database/` nếu là hạ tầng DB (vd `postgres-errors.ts` — mã `23505` + helper `isUniqueViolation`/`violatedConstraint`).
     - CHỈ hằng vận hành nội bộ của đúng 1 class, vô nghĩa bên ngoài nó (batch size mỗi tick, tên job đăng ký `SchedulerRegistry`, script Lua) → khai ngay đầu file đó, không nhét vào `constants.ts` cho khỏi thành bãi chứa.
  4. **Chuỗi định danh nội bộ cũng là hằng số, không phải literal tại chỗ dùng**: tên job `SchedulerRegistry`, Redis key, Kafka topic, tên unique constraint, prefix idempotency key, `Symbol` DI token... — luôn là named constant hoặc hàm builder đặt ở file chủ quản của concern đó (vd key Redis của Matching ở `redis/matching-redis.provider.ts`, idempotency key ở `matching.constants.ts`), kèm 1 dòng comment lý do/ngữ nghĩa ngay tại khai báo. **Không tồn tại Symbol/chuỗi định danh nào trong codebase mà không có nguyên tắc hay lý do ghi thành văn tại chỗ khai báo** — 2 loại key trùng format ghi đè nhau âm thầm, và người mở rộng sau không đoán được namespace nào đã bị chiếm.
- **Magic number có ngữ nghĩa ẩn phải được đặt tên kể cả khi chỉ dùng 1 chỗ** nếu nó gắn với 1 ngữ nghĩa ở NƠI KHÁC có thể đổi độc lập: vd cửa sổ `3600` giây gắn với chữ "PER_HOUR" trong tên env, độ dài OTP `6` gắn với SMS template/UX, default param `batchSize = 200` của job. Đặt tên + comment nói nó gắn với cái gì — đổi ngữ nghĩa bên kia mà quên bên này là bug thầm lặng.
- **Layer rõ ràng**: `Controller` → `Service` → `Repository`. Controller không gọi thẳng Repository.
- **DTO cho mọi input/output, không nhận `any`, không trả entity trần** — nhưng 2 chiều yêu cầu khác nhau: DTO **input** bắt buộc class-validator (validate tại boundary, dữ liệu do client kiểm soát); DTO **output** chỉ cần type + `@ApiProperty` + serialization (`@Exclude`/static `from(entity)`) — giá trị do server tự sinh, gắn class-validator vào output là validate thứ mình vừa tạo ra, vô nghĩa.
- **Dependency Injection** triệt để.
- **Module hoá theo domain**, không import chéo lung tung giữa module — riêng `common/` là hạ tầng dùng chung, không phải module nghiệp vụ, mọi module đều được import từ đó.
- **Error handling chuẩn hoá**: `DomainException` base class + global `ExceptionFilter`, format lỗi thống nhất (code, message, traceId).
- **Idempotency bắt buộc** cho mọi API động tới diamond (idempotencyKey).
- **Transaction DB bắt buộc** cho mọi thao tác trừ/cộng diamond (`SELECT FOR UPDATE` hoặc optimistic lock) — chỗ hay bug nhất trong toàn hệ thống.
- **Test bắt buộc**: unit test Service (Jest), e2e test cho flow quan trọng (matching → call → billing, mua diamond → nhận gift).
- **Lint/format**: ESLint + Prettier + Husky pre-commit.

## 5.2 NestJS lifecycle convention
- Dùng đúng lifecycle hook (`OnModuleInit`, `OnApplicationBootstrap`) để khởi tạo kết nối Redis/Kafka.
- `Guard` cho auth/permission, `Interceptor` cho logging/transform response, `Pipe` cho validate.
- Config qua `ConfigService`, không dùng `process.env` trực tiếp trong business logic.
- **Luôn tiêm `ConfigService<CoreApiEnv, true>`, không phải `ConfigService` trần** (`CoreApiEnv` khai trong `env.validation.ts`, khớp 1-1 với `coreApiEnvSchema`) — gọi `getOrThrow('KEY', { infer: true })`/`get('KEY', { infer: true })` thay vì tự viết `getOrThrow<string>('KEY')`. Thêm key mới vào Joi schema thì thêm luôn field tương ứng vào `CoreApiEnv` cùng lúc — gõ sai tên key hoặc sai kiểu là lỗi compile-time, không đợi tới lúc chạy mới vỡ.
- **`.env.example` ↔ Joi schema ↔ interface Env khớp 1-1 THEO TỪNG APP, không có key mồ côi**: `.env.example` là file chung cả repo = hợp của schema các app — mỗi key trong đó phải thuộc đúng 1 schema (`coreApiEnvSchema` hoặc `signalingEnvSchema`), và mỗi app khớp 1-1 giữa schema ↔ interface Env của nó (`CoreApiEnv`, `SignalingEnv`). Không thêm key "để sẵn" cho module chưa tồn tại (ai đó `getOrThrow` nó sẽ chết runtime vì schema không biết key này) — env key của 1 module ra đời CÙNG PR với module đó, đủ cả 3 nơi.
- **`getOrThrow()` mặc định, không phải `get()` + fallback tay**: mọi giá trị mặc định/optional khai 1 lần trong Joi schema (`env.validation.ts`, `.default(...)`), code luôn đọc bằng `getOrThrow()` — thiếu biến thì chết ngay lúc dùng thay vì âm thầm chạy với giá trị đoán, và không có 2 nơi cùng giữ 1 default (schema + `config.get('X', 100)` lặp lại) dễ lệch nhau khi sửa 1 chỗ quên chỗ kia. Ngoại lệ hợp lệ duy nhất: cờ môi trường có thể thật sự không tồn tại ở 1 số môi trường (vd `NODE_ENV`) thì dùng `get()`.
- **Job chạy định kỳ cần đọc interval từ config** (`.env`, không hardcode — § 5.1): không dùng decorator tĩnh `@Cron()`/`@Interval()`/`@Timeout()` (nhận giá trị cố định lúc decorate class) — đăng ký qua `SchedulerRegistry` (`@nestjs/schedule`) trong `onApplicationBootstrap`, đọc interval bằng `getOrThrow()` rồi `addInterval()`/`addCronJob()` thủ công (xem `outbox-relay.service.ts`, `ticket-sweeper.service.ts`).

## 5.3 Cấu trúc thư mục (ví dụ trong `apps/core-api`)
```
src/
 |-- modules/
 |    |-- matching/
 |    |    |-- matching.controller.ts
 |    |    |-- matching.service.ts       (facade — service TRÙNG TÊN module, public API qua DI)
 |    |    |-- matching.module.ts
 |    |    |-- matching.constants.ts     (hằng số/key builder dùng bởi ≥2 file trong module — § 5.1)
 |    |    |-- matching.errors.ts
 |    |    |-- index.ts                  (public API — module khác CHỈ import từ đây)
 |    |    |-- jobs/                     (matcher-worker, ticket-sweeper)
 |    |    |-- ports/                    (interaction-policy)
 |    |    |-- redis/                    (provider + key builder Redis riêng của module, nếu có)
 |    |    |-- dto/
 |    |    |-- entities/       (MatchTicket, MatchQueue, MatchSession)
 |    |    `-- events/
 |    `-- economy/
 |         |-- economy.controller.ts
 |         |-- economy.service.ts       (facade; tính toán/derive Wallet snapshot)
 |         |-- economy.module.ts
 |         |-- economy.constants.ts
 |         |-- economy.errors.ts
 |         |-- index.ts
 |         |-- services/       (ledger.service.ts — writer duy nhất; refund.service.ts)
 |         |-- jobs/           (iap-refund-poll, outbox-relay, reconciliation)
 |         |-- ports/          (iap-verifier, notification-verifier)
 |         |-- clients/        (apple-server-api, google-service-account)
 |         |-- webhooks/
 |         |-- dto/
 |         `-- entities/       (LedgerEntry, Wallet, Transaction)
 |-- common/                   (hạ tầng dùng chung TRONG core-api — cái gì app khác cũng cần thì lên libs/)
 |    |-- filters/
 |    |-- interceptors/
 |    |-- guards/
 |    |-- decorators/
 |    |-- constants/           (hằng số bên thứ 3 dùng ≥2 module — § 5.1)
 |    `-- types/               (hợp đồng type giữa modules và common, vd AccessTokenPayload — xem dưới)
 |-- database/                 (hạ tầng DB: naming strategy, datasource CLI, postgres-errors helper)
 |-- config/
 `-- main.ts
```

**Gốc module chỉ chứa đúng bộ**: `<module>.controller.ts / <module>.service.ts / <module>.module.ts / <module>.errors.ts / index.ts` (+ `<module>.constants.ts` khi module có hằng cấp module — optional, vd `user/` không có và không cần; + `<module>.integration.spec.ts` nếu có). Mọi thành phần khác xếp vào folder theo **vai trò** — bảng quyết định (chọn dòng ĐẦU TIÊN khớp):

| Thành phần là gì? | Folder | Ví dụ hiện có |
| --- | --- | --- |
| Xử lý HTTP webhook từ bên thứ 3 (controller `@Public` + verify chữ ký) | `webhooks/` | `economy/webhooks/` |
| **Port/Strategy**: abstract class (hoặc interface + Symbol) là boundary ổn định để cắm/đổi implementation qua env hoặc DI override — kể cả khi hiện mới có 1 impl dev, miễn là impl thật chắc chắn cắm vào đây sau (Twilio cho SMS, Safety module cho interaction-policy...) | `ports/` | `iap-verifier`, `notification-verifier`, `sms-provider`, `interaction-policy` |
| **Job nền chạy định kỳ** (đăng ký `SchedulerRegistry` trong `onApplicationBootstrap`) | `jobs/` | `outbox-relay`, `reconciliation`, `iap-refund-poll`, `matcher-worker`, `ticket-sweeper` |
| **Client bên thứ 3**: hàm/lớp thuần gọi API ngoài (không chứa rule nghiệp vụ, không phải port vì chỉ 1 impl) | `clients/` | `apple-server-api`, `google-service-account` |
| Provider hạ tầng store riêng của module (Redis/queue) + key builder của nó | `redis/` (hoặc tên store) | `matching/redis/` |
| **Sub-service nghiệp vụ** còn lại, gọi qua DI trong process | `services/` | `ledger.service`, `refund.service`, `otp.service`, `token.service` |

- Folder nào chưa có thành phần thì KHÔNG tạo sẵn (matching không có `services/` vì ngoài facade chưa có sub-service nào).
- **Unit test `*.spec.ts` đặt CẠNH file nó test** (chuẩn NestJS/Jest/Nx — test sống-chết-di-chuyển cùng file nguồn, không gom `tests/` riêng); test integration cả module (`*.integration.spec.ts`, cần DB thật) đặt ở gốc module.
- Lý do có bảng này: 1 repo mà 2 kiểu cấu trúc thì module thứ N không biết theo kiểu nào; folder trộn nhiều vai trò (service + job + port + client chung 1 chỗ) thì nhìn cây thư mục không còn đọc ra được kiến trúc module.

Mỗi module nghiệp vụ khác (auth, user, social, content, moderation, notification, gift) đi theo đúng bộ khung `*.controller.ts / *.service.ts / *.module.ts / dto/ / entities/ / events/` như ví dụ `matching/` ở trên. **Sinh module mới bằng skill `/new-module`** — thứ tự sinh file cố định + tự nối vào các mảnh khung dùng chung:

- `BaseAppEntity` (`src/common/entities/base.entity.ts`): uuid PK + createdAt/updatedAt — opt-in, entity có PK nghiệp vụ riêng hoặc bảng append-only thì tự khai cột.
- `@IdempotencyKey()` + `@ApiIdempotencyKeyHeader()` (`src/common/decorators/idempotency-key.decorator.ts`): chuẩn duy nhất để nhận idempotency key ở controller — validate bắt buộc + độ dài, service chỉ còn lo prefix theo domain + unique constraint DB.
- `CursorPageQueryDto` / `encodeCursor` / `decodeCursor` / `buildCursorPage` (`@litmatch/common-dtos`): chuẩn duy nhất cho list cursor-based — query `limit + 1` rồi đưa qua `buildCursorPage`.
- `DomainException` + `<Module>Errors` trong `*.errors.ts` (`@litmatch/common-exceptions`).

Khung chỉ cứng ở tầng hình thái này — business logic trong service tự do, không abstract hoá nghiệp vụ.

**Enum và interface nội bộ — định nghĩa cùng file dùng nó, không tách file riêng mặc định:**

- Enum chỉ gắn với 1 cột của đúng 1 entity (vd `IapProvider` trên cột `IapReceipt.provider`) → khai ngay trong file entity đó (`*.entity.ts`/`*.entities.ts`), `export` để nơi khác import khi cần. Không tạo `*.enums.ts` riêng cho 1 enum nhỏ dùng 1 chỗ.
- Interface là input/output cho lời gọi **nội bộ giữa module qua DI** (không phải DTO nhận từ HTTP — HTTP DTO vẫn bắt buộc class + class-validator theo § 5.1) → khai ngay trong `*.service.ts` là nơi định nghĩa/dùng nó, `export` thẳng để module khác import qua đúng public API (`index.ts`). Không cần class-validator vì đây không phải system boundary.
- Chỉ tách ra file riêng (`*.enums.ts`, `*.interfaces.ts`) khi 1 enum/interface thực sự dùng chung bởi ≥2 entity/service không liên quan trực tiếp, để tránh import vòng hoặc kéo cả file service chỉ để lấy 1 type.
- **Port/Strategy cần cắm/đổi implementation qua config** (vd verify receipt IAP, gửi SMS, verify webhook — nơi cần đổi Dev ↔ Store/thật qua env mà không sửa code gọi; không bắt buộc phải đã có ≥2 impl, chỉ cần boundary là thật): khai `abstract class` + toàn bộ implementation cụ thể (`Dev...`, `Store...`) chung 1 file đặt tên theo khái niệm (`iap-verifier.ts`, `sms-provider.ts`) trong folder `ports/` của module, không tách mỗi implementation 1 file. Bind qua module bằng `provide: <AbstractClass>` (dùng thẳng class làm token, không cần `Symbol`) + `useClass`/`useFactory` chọn theo config.
- **DI token qua `Symbol()`**: chỉ dùng khi KHÔNG có class để làm token — type của thư viện ngoài (vd client Redis) hoặc 1 `interface` thuần không tồn tại lúc runtime (vd 1 policy có thể bị override bởi module khác chưa tồn tại). Có abstract class rồi thì bind thẳng bằng class đó, không tạo thêm `Symbol`. Mỗi `Symbol` phải có comment lý do tồn tại ngay tại khai báo (§ 5.1 mục 4).
- **Type là HỢP ĐỒNG giữa 2 nơi (producer/consumer khác file) thì chỉ có 1 định nghĩa, đặt ở phía không được phép import phía kia**: vd `AccessTokenPayload` — auth ký, guard ở `common/` verify; `common/` không được import từ `modules/` nên type đặt ở `common/types/` và cả 2 đầu cùng import. Producer dùng đúng type đó khi tạo giá trị (`const payload: AccessTokenPayload = {...}`), KHÔNG truyền object literal trần — lệch hợp đồng phải là lỗi compile, không phải bug runtime. Khi app thứ 2 (signaling-gateway) cần cùng hợp đồng → chuyển lên `libs/`.
- **Trước khi tự viết helper cho việc "ai cũng gặp" (pagination, idempotency, bắt lỗi DB, hash...): kiểm tra khung dùng chung bên dưới + `common/` + `libs/` đã có chưa** — tự chế bản riêng (vd tự encode cursor bằng `Buffer` thay vì `encodeCursor`/`buildCursorPage` của `@litmatch/common-dtos`) tạo 2 chuẩn song song, client/reviewer không biết tin bản nào, và bản tự chế thường thiếu case (cursor hỏng, race...) mà bản chung đã xử.

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
- **Bug/bất biến nội bộ bị vi phạm (không phải lỗi client) → `throw new Error(...)` thường, KHÔNG bọc `DomainException`**: dữ liệu inconsistent ("dữ liệu hỏng"), caller gọi sai hợp đồng (tham số phải dương mà nhận âm, thiếu field bắt buộc do lỗi lập trình chứ không phải do request), guard "không bao giờ xảy ra" — những chỗ này không có mã lỗi nghiệp vụ để đặt tên trong `*.errors.ts`, cứ để rơi qua global exception filter mặc định thành 500. `DomainException` chỉ dành cho lỗi đã đặt tên, client sửa được (đủ tiền, sai trạng thái, thiếu quyền...).
- `httpStatus` của `DomainException` truyền bằng enum `HttpStatus` của `@nestjs/common` (`HttpStatus.CONFLICT`, không phải `409`) — nhất quán với `@HttpCode(HttpStatus.OK)` ở controller (docs/10 § 10.1.G).
- `traceId` hiện = request-id: lấy từ header `x-request-id` nếu client gửi, không thì UUID sinh tại entry (`libs/logger` `genReqId`) — trả trong mọi error response và ghi kèm mọi log line của request đó. Nâng lên trace context của OpenTelemetry khi dựng tracing thật (Giai đoạn 6/7) — docs mô tả hiện trạng, không mô tả thứ chưa tồn tại như đã có.

## 5.6 Naming convention

- File: kebab-case chuẩn NestJS (`matching.service.ts`, `match-ticket.entity.ts`); class PascalCase; hằng số UPPER_SNAKE.
- DB: bảng snake_case số nhiều (`ledger_entries`, `match_tickets`), cột snake_case — map qua naming strategy của TypeORM, không đặt tên cột camelCase trong DB.
- Event (nội bộ + Kafka): `<domain>.<subject>.<động-từ-quá-khứ>` — vd `economy.diamond.deducted`, `matching.pair.confirmed`, `call.session.ended`.
- Kafka topic theo domain: `litmatch.<domain>.events`; consumer group theo app + module: `core-api.notification`.
- Env var: UPPER_SNAKE có prefix domain — `ECONOMY_FREE_CALL_SECONDS`, `MATCHING_SPEEDUP_PRICE_DIAMOND`.

## 5.7 Logging & observability

- Structured JSON log (pino qua logger lib chung ở `libs/logger`) — cấm `console.log`. Mỗi line tối thiểu: timestamp, level, context (module), traceId, message.
- **Cấm log PII/secret**: token, password, OTP, receipt IAP, nội dung tin nhắn, số dư gắn kèm danh tính đầy đủ — danh sách field cấm log (redact list) đặt tập trung trong `libs/logger`, không tự nhớ ở từng chỗ. Ngoại lệ duy nhất: provider **dev-only bị chặn cứng ở production** (throw lúc bootstrap nếu `NODE_ENV=production`, vd `DevSmsProvider`) được log nội dung gửi đi — đó là kênh nhận OTP duy nhất ở local/test; impl thật thì tuân thủ đầy đủ.
- Metrics Prometheus đặt tên `<domain>_<subject>_<đơn_vị>`: `matching_queue_wait_seconds`, `economy_ledger_write_failures_total`.
- Audit log cho hành động nhạy cảm ([06-domain-rules.md](./06-domain-rules.md)) là **bảng DB append-only** (dữ liệu nghiệp vụ), không phải log text.

## 5.8 Security baseline

- `helmet` + CORS allowlist theo env (cấm `*` ở production); rate limit mặc định bằng `@nestjs/throttler` + limit riêng chặt hơn cho login/OTP, report, gift, vào queue matching. Limit per-route khai ngay tại `@Throttle` với `ttl` qua helper `seconds()`/`minutes()` của `@nestjs/throttler` (không viết `60_000` tay); các limit này là security posture cố định đi theo code review, KHÔNG đưa vào env (`@Throttle` là decorator tĩnh, và đổi limit phải qua review chứ không phải sửa config im lặng) — chỉ default toàn cục (`THROTTLE_TTL_SECONDS`/`THROTTLE_LIMIT`) là env.
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
- **Nguồn của key — 2 trường hợp, chọn theo bản chất giao dịch**: (a) hành động do client khởi tạo, không có ID ngoài nào (mua VIP, speed-up, tặng quà) → header `Idempotency-Key` qua `@IdempotencyKey()`, service prefix theo domain; (b) giao dịch có **ID bất biến từ hệ thống ngoài** (IAP: `providerTransactionId` Apple/Google, webhook notification id) → dùng chính ID đó làm key, server tự derive, KHÔNG cần header — mạnh hơn header vì client không kiểm soát được giá trị (vd `POST /economy/iap/verify` idempotent theo `iap:<provider>:<providerTransactionId>`). "Idempotency bắt buộc cho mọi API động tới diamond" nghĩa là bắt buộc CÓ key + unique constraint, không có nghĩa bắt buộc là header.
- **2 request song song cùng key** (request đầu chưa commit): request sau bắt unique violation *trước* khi request đầu xong → **retry đọc ngắn có backoff** tới khi row hiện trạng thái cuối, rồi trả kết quả cũ. Không được tự tạo giao dịch mới.
- **Cùng key nhưng payload khác** (`request_hash` khác) → trả 409 `*_IDEMPOTENCY_CONFLICT` (lỗi client, không phải retry).
- **Check + hành động luôn atomic**: gộp trong 1 DB transaction với `SELECT ... FOR UPDATE` (hoặc optimistic lock), xác minh lại điều kiện (số dư, quyền, trạng thái) **tại thời điểm hành động**, không tin giá trị đọc trước đó ([10 § 10.0.C](./10-code-review-checklist.md)).
- **Không diễn giải lại giao dịch cũ theo config hiện tại**: giá/tỉ lệ áp dụng phải snapshot vào bản ghi giao dịch (versioned pricing), đọc lại từ snapshot đó — đổi giá không bao giờ đụng giao dịch đã ghi.

---
[← 04 · Tech Stack](./04-tech-stack.md) · [06 · Domain Rules →](./06-domain-rules.md)
