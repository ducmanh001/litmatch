[← 16 · Module Blueprint](./16-module-blueprint.md) · **17 · Naming Conventions** · [00 · Mục lục →](./00-overview-and-index.md)

# 17. Quy ước đặt tên — mọi loại định danh

File này là nguồn chuẩn cho **tất cả tên mới** trong repo: file/folder, package, biến,
tham số, function/method, class/type/interface/enum, React component/hook, DTO, entity,
API, database, event, queue/key, config/env, metric, test và migration. Mục tiêu là để tên
tự nói đúng **khái niệm, vai trò và contract**, không chỉ đúng kiểu chữ.

Quy tắc kiến trúc, ownership và vị trí code vẫn thuộc docs/03, docs/11, docs/05 và
docs/12–13. Khi một quy tắc ở các file đó cụ thể hơn cho một boundary, quy tắc cụ thể hơn
được ưu tiên; không tạo một cách gọi khác cho cùng khái niệm. Không đổi tên code legacy chỉ
để làm đẹp nếu không chạm vào nó hoặc không có migration/compatibility plan.

Mức độ quy tắc: **MUST/BẮT BUỘC** là chuẩn cho code mới; **SHOULD/MẶC ĐỊNH** được lệch khi
lý do làm rõ hơn và phạm vi lệch hẹp. Generated code và tên bắt buộc từ framework/protocol
được giữ nguyên theo generator/protocol.

## 17.1 Nguyên tắc chọn tên

1. **Tên theo domain và contract, không theo cách cài đặt hiện tại.** Dùng `activeTicket`,
   `recipientUserId`, `reconciliationReport`; không dùng `data`, `temp`, `helper`,
   `manager`, `value2`, `newData` hoặc `redisResult` nếu một tên nghiệp vụ chính xác hơn tồn
   tại. Biến vòng lặp cục bộ rất hẹp có thể là `item`, `index`, `entry` khi ngữ cảnh đã rõ.
2. **Một khái niệm có một thuật ngữ chuẩn trong cùng boundary.** Đã gọi `matchSession` thì
   không xen `session`, `match`, `room` để chỉ cùng đối tượng. Tra domain model, OpenAPI và
   public API đang sở hữu khái niệm trước khi đặt tên mới.
3. **Tên phải biểu lộ đơn vị, thời điểm và tập hợp khi những điều đó ảnh hưởng correctness.**
   Ví dụ `timeoutMs`, `durationSeconds`, `priceDiamond`, `createdAt`, `expiresAt`,
   `memberIds`, `usersById`. Không dùng `timeout`, `amount`, `date` hay `list` mơ hồ.
4. **Không mã hoá kiểu dữ liệu hoặc access modifier vào tên.** Cấm Hungarian notation và
   prefix/suffix như `strName`, `userArray`, `objResult`, `_privateMethod`, `IUser`. Type,
   `private`/`protected` và module boundary đã diễn tả việc đó. Ngoại lệ duy nhất là `T`/`TItem`
   cho generic parameter (§ 17.4).
5. **Đủ dài để không cần đoán, đủ ngắn để đọc được.** Không viết tắt tự chế như `cfg`, `ctx`,
   `usr`, `msg`, `btn`, `mgr`. Các chữ viết tắt phổ biến dùng một kiểu thống nhất:
   `userId`, `apiUrl`, `httpStatus`, `jwtPayload`, `otpCode`, `dbTransaction`, `ttlSeconds`;
   trong PascalCase là `ApiClient`, `HttpStatus`, `JwtPayload`, `OtpService`, `IapVerifier`.
   Tên sản phẩm/protocol do bên ngoài quy định giữ spelling của contract tại boundary.
6. **Không dùng phủ định kép cho trạng thái.** `isEnabled`, `hasAccess`, `canPublish`,
   `shouldRetry`; không dùng `isNotDisabled`, `noAccess`, `notReady` khi có thể gọi khẳng định
   tương đương. Trường hợp domain vốn là phủ định (ví dụ trạng thái `isBlocked`) vẫn hợp lệ.

## 17.2 Kiểu chữ theo bề mặt

| Bề mặt                                                              | Quy ước                                              | Ví dụ                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| Package, app, lib, folder, source file                              | `kebab-case`                                         | `core-api`, `party-room`, `party-room.service.ts`                            |
| Test source                                                         | suffix theo loại test                                | `party-room.service.spec.ts`, `party-room.integration.spec.ts`               |
| Migration                                                           | `<timestamp>-<mô-tả-kebab>.ts`                       | `1753500000000-party-room-livekit-url.ts`                                    |
| Biến, param, property, function, method                             | `camelCase`                                          | `recipientUserId`, `calculatePrice()`, `createdAt`                           |
| Class, abstract class, interface, type alias, enum, React component | `PascalCase`                                         | `PartyRoom`, `JoinPartyRoomInput`, `PartyRoomStatus`, `UserTable`            |
| Hook React                                                          | `use` + `PascalCase`                                 | `useReportQueue`, `useIdempotencyKey`                                        |
| Non-callable constant                                               | `UPPER_SNAKE_CASE`                                   | `DEFAULT_PAGE_SIZE`, `UQ_ACTIVE_USER`                                        |
| Object constant/namespace-like value                                | `PascalCase`; key theo contract                      | `EconomyErrors.WALLET_INSUFFICIENT_BALANCE`, `RealtimeEvents.MatchConfirmed` |
| Enum member                                                         | `PascalCase`; serialized value theo contract         | `PartyRoomStatus.Active = 'active'`                                          |
| SQL table, column, constraint, index                                | `snake_case`                                         | `party_rooms`, `host_user_id`, `uq_party_members_active_user`                |
| JSON field, TypeScript DTO property, OpenAPI operationId            | `camelCase`                                          | `idempotencyKey`, `listPartyRooms`                                           |
| HTTP path segment                                                   | `kebab-case`, resource là số nhiều khi là collection | `/party-rooms`, `/match-sessions/:sessionId`                                 |
| Header chuẩn/protocol                                               | chữ hoa-thường chuẩn HTTP; custom dùng `Kebab-Case`  | `Authorization`, `Idempotency-Key`                                           |
| Event và Redis/Kafka channel/key                                    | lowercase có phân cấp theo protocol                  | `party.member.joined`, `realtime:user:{userId}`                              |
| Env var, error code                                                 | `UPPER_SNAKE_CASE`                                   | `PARTY_MAX_SPEAKERS`, `ECONOMY_WALLET_INSUFFICIENT_BALANCE`                  |
| Prometheus metric                                                   | `snake_case` + unit/counter suffix chuẩn             | `matching_ticket_wait_seconds`, `call_ended_total`                           |

Ngoại lệ tên file bắt buộc của framework/tool (`AGENTS.md`, `README.md`, `Dockerfile`,
`.env.example`, Next `page.tsx`/`layout.tsx`/`error.tsx`) giữ nguyên tên chuẩn. Không dùng
PascalCase cho source file, kể cả file component.

## 17.3 Biến, property, parameter và collection

- Danh từ **số ít** cho một giá trị: `user`, `ticket`, `transaction`, `isGuest`. Danh từ **số
  nhiều** cho collection: `users`, `ticketIds`, `transactions`. Với cấu trúc có index/key,
  nói rõ quan hệ: `usersById`, `ticketsByRegion`, `memberIdsByRoomId`.
- Parameter phải mô tả ý nghĩa tại boundary, không chỉ kiểu: `actorUserId` tốt hơn `userId`
  khi caller là người thực hiện; `targetUserId` tốt hơn `id` khi action cần đối tượng đích.
  `id` chỉ phù hợp trong scope rất hẹp, nơi entity đã hiển nhiên.
- Tên boolean dùng một predicate trả lời được đúng/sai: `isActive`, `hasMore`, `canJoin`,
  `shouldPublish`, `wasReversed`. `is` diễn tả state, `has` diễn tả sở hữu/tồn tại, `can` là
  capability/policy, `should` là quyết định/khuyến nghị, `was` là kết quả quá khứ.
- Giá trị đếm dùng `count`, `total`, `max`, `min`, `limit` đúng nghĩa: `retryCount`,
  `totalMembers`, `maxSpeakers`, `pageSize`. Giá trị tiền ghi currency: `priceDiamond`,
  `pointsAwarded`; giá trị thời gian ghi unit: `delayMs`, `expiresAt`, `createdAt`.
- Destructure chỉ giữ alias khi tránh đụng độ hoặc làm rõ vai trò: `const { id: ticketId } =
ticket`; không đổi tên tuỳ tiện khiến contract bị che đi.

## 17.4 Function, method, callback và hook

Tên hành động bắt đầu bằng động từ cụ thể và phải khớp side effect/absence contract. Promise
không cần suffix `Async`; kiểu trả về đã thể hiện async. Không đặt `handle`, `process`, `do`,
`run` hoặc `manage` cho business operation mơ hồ nếu có động từ domain chính xác hơn.

| Ý nghĩa                              | Tên chuẩn                                                                | Contract tối thiểu                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Đọc một giá trị có thể không tồn tại | `findTicket`                                                             | Trả giá trị hoặc `null`/`undefined`; caller phải xử lý absence                                                 |
| Đọc một giá trị bắt buộc tồn tại     | `getTicketOrThrow`                                                       | Absence thành lỗi được đặt tên; không trả absence im lặng                                                      |
| Đọc collection                       | `listTickets`                                                            | Trả collection/page, không dùng `getAll*`                                                                      |
| Kiểm tra/số lượng                    | `hasActiveTicket`, `canJoinRoom`, `countMembers`                         | Predicate trả boolean; `count*` trả number                                                                     |
| Tạo/ghi state mới                    | `createPartyRoom`, `recordTransaction`, `issueAccessToken`               | Động từ nêu đúng mutation; dùng `record` cho append-only record                                                |
| Thay đổi state có sẵn                | `updateProfile`, `changeRole`, `closeRoom`, `revokeToken`                | Tên chỉ ra transition/thao tác thật                                                                            |
| Đảm bảo idempotent                   | `ensureFriendship`                                                       | Phải nói rõ result có thể là existing/new khi caller cần biết                                                  |
| Validate/parse/assert                | `parseCursor`, `validateWebhook`, `assertPositiveAmount`, `isValidPhone` | `parse` chuyển representation; `validate` trả/throw theo API đã ghi; `assert` throw; `isValid` chỉ trả boolean |
| Convert/build thuần                  | `toPartyRoomDto`, `fromProviderPayload`, `buildMatchKey`                 | Không có side effect ẩn                                                                                        |
| Nhận event/callback UI               | `handleTicketMatched`, `handleSubmit`, `onSubmit`                        | `handle*` là implementation handler; `on*` là callback prop/event registration                                 |

- React component là danh từ PascalCase (`PartyRoomList`), event prop là `onClose`,
  implementation handler là `handleClose`; hook luôn bắt đầu `use`.
- Decorator callable và factory trả về decorator là ngoại lệ PascalCase theo convention
  framework: `CurrentUser()`, `IdempotencyKey()`; function/helper thường vẫn camelCase.
- Generic parameter dùng `T` nếu chỉ một type, hoặc `TItem`, `TResult`, `TInput` khi có nhiều
  type. Không dùng `A`, `B`, `X` trừ generic toán học cực hẹp.

## 17.5 Class, type, interface, enum và contract

- Tên type mô tả **shape/ý nghĩa**, không lặp từ khoá TypeScript: `UserProfile`,
  `CreateNotificationInput`, `CursorPage<T>`; không `IUserProfile`, `UserProfileInterface`,
  `UserProfileType` hoặc `UserProfileData`.
- Suffix role là một phần contract: `*Dto` cho transport HTTP, `*Input` cho input service/port,
  `*Result`/`*View` cho output, `*Entity` chỉ khi cần phân biệt persistence model, `*Event` cho
  event payload/contract, `*Config` cho cấu hình đã validate.
- Class NestJS dùng `<Domain><Role>`: `EconomyModule`, `PartyRoomController`,
  `MatchingService`, `LivekitRoomPort`, `AppleStoreClient`, `JwtAuthGuard`,
  `GlobalExceptionFilter`, `CallTickerService`. `Repository` chỉ dành cho data-access adapter;
  `Service` không là tên thay thế cho mọi class.
- Enum type là danh từ số ít (`TransactionStatus`, `PartyRole`); member PascalCase. Giá trị string
  là một phần của DB/API/event contract nên dùng convention của bề mặt đó (`'active'`,
  `'iap_purchase'`), không đổi chỉ để khớp TypeScript.
- Exported name phải phản ánh public contract. Helper chỉ dùng nội bộ không export; không dùng
  default export trừ entry framework bắt buộc (Next `page.tsx`, `layout.tsx`, `error.tsx`).

## 17.6 API, persistence, message và configuration

- **HTTP/API:** URL diễn tả resource, không diễn tả UI/action chung chung: `POST /party-rooms`,
  `PATCH /party-rooms/:roomId/role`; path param tận cùng `Id` (`roomId`, `userId`). JSON field
  camelCase và khớp DTO/OpenAPI. Đừng tạo spelling riêng ở client và server.
- **Database:** bảng plural snake_case, cột snake_case; entity/property TypeScript camelCase qua
  naming strategy. FK column theo `<entity>_id`, time theo `created_at`/`updated_at`/`*_at`.
  Tên index `idx_<table>_<query-shape>`, unique `uq_<table>_<invariant>`, check
  `chk_<table>_<rule>`, foreign key `fk_<child>_<parent>`; tên phải nói invariant/query thật.
- **Error code:** `<DOMAIN>_<SUBJECT>_<REASON>` UPPER_SNAKE_CASE, stable và client-actionable;
  ví dụ `MATCHING_TICKET_ALREADY_QUEUED`. Constant object có namespace PascalCase và key
  UPPER_SNAKE_CASE: `MatchingErrors.TICKET_ALREADY_QUEUED`.
- **Event/topic/key:** event `<domain>.<subject>.<past-tense-verb>` như
  `matching.pair.confirmed`; key/channel có namespace rõ và builder tập trung, như
  `realtime:user:{userId}`. Topic Kafka theo docs/05 § 5.6; literal identifier không rải tại
  call site (§ 5.1).
- **Env/config:** env có prefix domain khi không phải chuẩn runtime: `MATCHING_SPEEDUP_PRICE_DIAMOND`.
  Key property sau khi parse dùng camelCase (`matchingSpeedupPriceDiamond`). Không nhầm config
  key với constant: config có thể đổi theo environment, constant không.
- **Metric/log label:** tên metric Prometheus theo docs/05 § 5.7; label là lowercase snake_case
  và stable (`status_code`, `reason`). Không đưa ID/PII hoặc giá trị cardinality cao vào tên/label.

## 17.7 Test, fixture và tên mô tả

- Test file dùng suffix ở § 17.2. `describe` gọi subject đang kiểm tra; `it`/`test` mô tả
  behavior quan sát được, gồm điều kiện quan trọng và kết quả, không chỉ lặp lại tên method.
  Ví dụ: `it('rejects a duplicate idempotency key with a different payload', ...)`.
- Fixture/factory dùng động từ đúng side effect: `buildUser()` tạo object in-memory,
  `createUser()` persist qua boundary test; `givenActiveTicket()` chỉ dùng khi nó thiết lập
  precondition đọc được như câu chuyện test. Không dùng `makeData`, `testData2`.
- Mock/spies giữ tên dependency thật (`economyService`, `notificationPort`); suffix `Mock` chỉ
  dùng khi trong cùng scope có cả implementation thật và test double cần phân biệt.

## 17.8 Quy trình dùng và review

1. Trước khi tạo tên public, tìm thuật ngữ trong module owner, domain model, OpenAPI và constants
   hiện hữu. Dùng lại tên nếu cùng khái niệm; nếu contract cần tên mới, đặt tại module owner.
2. Đọc tên như một câu: object/subject + action + result có khớp boundary, quyền và side effect
   không? Kiểm tra tương ứng số ít/số nhiều, predicate và unit/currency.
3. Khi tên xuất hiện ở nhiều boundary (DTO → API → event → DB), chọn một canonical term và map
   case theo § 17.2, thay vì dịch/viết tắt khác nhau ở mỗi tầng.
4. Review code mới theo các câu hỏi: có `data`/`temp`/viết tắt tự chế không; method có nói đúng
   absence và mutation contract không; collection/boolean/unit có rõ không; literal identifier
   đã được đặt tên ở owner chưa; spelling có trùng với domain/API đang có không.
5. Lệch chuẩn chỉ hợp lệ khi bị framework/protocol ép hoặc tăng rõ ràng khả năng đọc. Ghi ngắn
   lý do tại boundary; nếu tạo một pattern có thể tái dùng, cập nhật file này trong cùng thay đổi.

---

[← 16 · Module Blueprint](./16-module-blueprint.md) · [00 · Mục lục →](./00-overview-and-index.md)
