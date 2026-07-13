# Safety Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 4 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/safety`.
> Đây là implementation thật cho seam đã tồn tại từ Giai đoạn 2:
> `MATCH_INTERACTION_POLICY` ([matching-service.md](./matching-service.md)) và cột
> `User.trustScore` (đã có sẵn từ Giai đoạn 0, chưa dùng tới).

## 1. Data model — append-only, không update/xoá dòng cũ

- `Report`: `reporterUserId`, `targetUserId`, `reason` (enum), `description` (nullable),
  `createdAt`. Không có cột trạng thái mutable ở GĐ4 (moderation queue admin xem trực tiếp danh
  sách, xử lý thật thuộc Task 0 admin — ngoài scope GĐ4, ghi nợ kỹ thuật ở § 5).
- `Block`: log hành động, KHÔNG phải bảng trạng thái mutable — mỗi dòng là 1 sự kiện
  `action ∈ {blocked, unblocked}` giữa `(blockerUserId, blockedUserId)`. Trạng thái "đang block"
  = dòng mới nhất theo cặp có `action = blocked` (query `ORDER BY createdAt DESC LIMIT 1`, index
  `(blockerUserId, blockedUserId, createdAt DESC)`). Lý do chọn log thay vì 1 dòng mutable: giữ
  toàn bộ lịch sử block/unblock cho điều tra T&S (docs/06 "hành động nhạy cảm phải log audit
  riêng, không xoá được") mà không cần bảng snapshot riêng (khác Wallet/Ledger — ở đây 1 lookup
  có index đã đủ rẻ, không có bài toán tái tính tổng).

## 2. `SafetyService` — public API (qua `index.ts`)

- `report(reporterUserId, targetUserId, reason, description?): Promise<void>` — chặn tự report
  chính mình; ghi `Report`; áp trust-score penalty theo § 3. KHÔNG publish outbox event ở GĐ4 —
  chưa có consumer thật (Notification GĐ4 không cần tin report — checklist chỉ định match/tin
  nhắn/gift/like-comment; admin moderation queue chưa tồn tại — Task 0). Thêm outbox khi có
  consumer thật, không tạo "để dành" (docs/11).
- `block(blockerUserId, targetUserId): Promise<void>` / `unblock(...)` — ghi `Block` action
  tương ứng; idempotent (block khi đang block → no-op, không ghi dòng trùng thừa — kiểm tra
  action mới nhất trước khi insert).
- `isBlocked(blockerUserId, targetUserId): Promise<boolean>` — trạng thái hiện tại 1 chiều, dùng
  bởi Friend Chat (§ 6).
- `getBlockedUserIds(userId): Promise<string[]>` — tập userId đang block ACTIVE 2 chiều với
  `userId` (1 query `DISTINCT ON`), dùng bởi Feed để lọc feed 1 lần thay vì gọi lặp
  ([feed-service.md § 3](./feed-service.md)).
- `canPair(userAId, userBId): Promise<boolean>` — ĐẶT TRÙNG TÊN với
  `MatchInteractionPolicy.canPair` (§ 3.1) có chủ đích: `SafetyService` thoả mãn interface này
  bằng structural typing, matching.module.ts bind thẳng `useExisting: SafetyService` vào token
  `MATCH_INTERACTION_POLICY` — không cần thêm class adapter riêng.

## 3. Matching exclusion (docs/06 "không match lại người vừa report/block trong X ngày")

### 3.1 `canPair` tại thời điểm ghép

`false` nếu, giữa A và B (2 chiều):

- Có `Block` đang active (bất kỳ ai block ai) — không giới hạn thời gian, cho tới khi unblock.
- Có `Report` hoặc `Block` (action bất kỳ) được tạo trong `SAFETY_REMATCH_COOLDOWN_DAYS` ngày gần
  nhất — kể cả nếu report đã dismiss/chưa xử lý, để giảm phơi nhiễm ngay lập tức trong lúc chờ
  review (chưa có admin review ở GĐ4, xem § 5).

Query chạy trong transaction verify của `tryPair` (đã có sẵn call site — matching-service.md
§ 2), KHÔNG chỉ lúc enqueue ticket.

### 3.2 Trust score ảnh hưởng priority (không sửa state machine/lock đã có)

Lúc tạo `MatchTicket` (enqueue), `MatchingService` đọc `trustScore` hiện tại của user qua
`UserService`, cộng penalty vào score Redis khởi tạo (số càng cao → bị `ZPOPMIN` xử lý sau,
tương tự cách `priorityBoostMs` trừ vào score đã có):

```text
penaltyMs = min(
  MATCHING_TRUST_PENALTY_MAX_MS,
  max(0, 100 - trustScore) * MATCHING_TRUST_PENALTY_MS_PER_POINT
)
score = enqueuedAtMs + penaltyMs   // càng thấp trust score, càng "trẻ" ảo — bị xếp sau
```

Đây là snapshot 1 lần lúc enqueue (giống `preference` đã snapshot lên ticket) — trust score đổi
giữa lúc ticket đang chờ không re-tính lại (nhất quán với cách boost hoạt động: chỉ cộng dồn qua
API speed-up, không tự đổi ngầm). Không dùng để chặn hẳn matching (đó là việc của
`UserStatus.Banned` + auth guard, ngoài scope file này) — chỉ làm chậm lại.

## 4. Trust score penalty — chống lạm dụng report ("vote-kick")

- Mỗi cặp `(reporterUserId, targetUserId)` chỉ tính **1 report có hiệu lực** lên trust score mỗi
  `SAFETY_REPORT_COOLDOWN_DAYS` ngày — report thêm trong window vẫn ghi `Report` (giữ evidence)
  nhưng không trừ thêm điểm (check: có report hiệu lực nào của đúng cặp này trong window chưa).
- Cap tổng penalty/ngày cho 1 `targetUserId` bằng `SAFETY_TRUST_PENALTY_DAILY_CAP` điểm — chặn 1
  nhóm report dồn dập từ nhiều reporter khác nhau đánh sập trust score ai đó trong vài phút.
- Trừ điểm qua `UserService.adjustTrustScore(userId, -delta, reason, manager?)` (method mới,
  atomic trong DB transaction cùng với insert `Report` — không phải 2 bước riêng có thể lệch nếu
  1 bước fail).
- Sàn trust score: không đặt CHECK ở DB (theo đúng tinh thần Wallet — guard ở tầng ứng dụng), clamp
  ở tầng service về `SAFETY_TRUST_SCORE_FLOOR` (default 0) khi tính penalty, tránh số âm vô nghĩa.

## 5. Nợ kỹ thuật ghi rõ (không tự chế guard giả)

- **Admin review report**: GĐ4 KHÔNG có bước admin xác nhận report trước khi áp penalty (Task 0
  admin backend + moderation queue UI chưa tồn tại — [07-roadmap.md](../07-roadmap.md) frontend
  track). Khi có, thêm cột trạng thái + luồng review, có thể áp thêm penalty mạnh hơn khi admin
  confirm; KHÔNG lùi lại penalty tự động hiện tại (giữ nguyên, chỉ bổ sung).
- **Ban tự động khi trust score quá thấp**: chưa làm — trust score chỉ ảnh hưởng priority
  matching (§ 3.2), không tự chuyển `UserStatus` sang `Banned`. Quyết định vận hành mở khi có
  admin.

## 6. Wire vào module đã tồn tại (trả nợ kỹ thuật đã ghi ở docs/10)

- `matching/matching.module.ts`: import `SafetyModule`, override provider
  `{ provide: MATCH_INTERACTION_POLICY, useExisting: SafetyService }` thay
  `AllowAllInteractionPolicy`. `MatchTicket` thêm cột `trustPenaltyMs` (snapshot 1 lần lúc
  enqueue — § 3.2); `ticketScore()` cộng thêm cột này vào công thức có sẵn, không đổi lock/state
  machine.
- `friend/`: `ConversationService.sendMessage` (hoặc call site tương đương) check
  `SafetyService.isBlocked(sender, khác)` 2 chiều trước khi cho gửi — lỗi trả về giống lỗi
  "không phải thành viên conversation" (không tiết lộ ai block ai qua mã lỗi khác nhau, tránh
  oracle).

## 7. Config (`env.validation.ts` + `.env.example`, không hardcode)

| Key                                   | Default | Ý nghĩa                                                   |
| ------------------------------------- | ------- | --------------------------------------------------------- |
| `SAFETY_REMATCH_COOLDOWN_DAYS`        | 30      | Không ghép lại nếu có report/block trong X ngày (docs/06) |
| `SAFETY_REPORT_COOLDOWN_DAYS`         | 7       | 1 cặp reporter→target chỉ tính 1 report hiệu lực/X ngày   |
| `SAFETY_TRUST_PENALTY_PER_REPORT`     | 5       | Điểm trừ mỗi report hiệu lực                              |
| `SAFETY_TRUST_PENALTY_DAILY_CAP`      | 20      | Trần tổng điểm trừ/ngày cho 1 target                      |
| `SAFETY_TRUST_SCORE_FLOOR`            | 0       | Sàn clamp khi áp penalty                                  |
| `MATCHING_TRUST_PENALTY_MS_PER_POINT` | 2000    | ms cộng vào score matching / điểm dưới 100                |
| `MATCHING_TRUST_PENALTY_MAX_MS`       | 120000  | Trần penalty ms (tránh queue-starvation)                  |
