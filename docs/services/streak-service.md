# Streak trò chuyện (mở rộng module `friend`) — đặc tả chi tiết

> W2 của [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)
> ([07-roadmap.md](../07-roadmap.md) Giai đoạn 2). Sub-service `StreakService` trong
> `apps/core-api/src/modules/friend/services/streak.service.ts` — không export ra ngoài module,
> chỉ `FriendService` (facade) gọi (docs/05 § 5.3).

## 1. Data model

`conversation_streaks` — 1:1 với `Conversation`, tạo **lazy** (upsert `ON CONFLICT DO NOTHING`)
lúc có message đầu tiên đi qua streak logic — không thể tạo ATOMIC cùng `Friendship`/`Conversation`
như bất biến gốc của Friend Chat, vì streak ra đời SAU khi nhiều conversation cũ đã tồn tại.

- `currentStreak`/`longestStreak`: số ngày liên tiếp cả 2 chiều cùng nhắn.
- `userLowLastActiveDate`/`userHighLastActiveDate`: ngày UTC gần nhất **mỗi bên** gửi message
  trong conversation — tăng đơn điệu, KHÔNG reset dù streak vỡ (chỉ dùng phát hiện "cả 2 chiều đã
  nhắn hôm nay").
- `lastConfirmedDate`: ngày UTC gần nhất streak được xác nhận tăng.
- `graceUsedForDate`: ngày bị lỡ đã được grace cứu — **audit/idempotency**, không phải bộ đếm số
  lần dùng còn lại (xem § 3).
- `lastWarningSentAt`: idempotency cho cron cảnh báo — không liên quan tới 2 cột streak.

## 2. Tính on-write trong `sendMessage` — không phải 1 transaction gộp chung với message insert

`FriendService.sendMessage` gọi `ConversationService.sendMessage` (insert message, có idempotency
retry riêng) trước, rồi gọi `StreakService.recordActivity` **trong 1 transaction riêng ngay sau
đó** — không gộp chung 1 transaction Postgres với message insert.

**Vì sao tách 2 transaction** (khác chữ trong plan gốc §3.4 "trong transaction sendMessage"):
`ConversationService.sendMessage` tự bắt unique-violation-rồi-đọc-lại (idempotency retry) bằng
try/catch quanh 1 statement `INSERT` duy nhất — nếu gộp chung 1 transaction Postgres, statement
lỗi sẽ đưa CẢ transaction vào trạng thái aborted, câu query "đọc lại" tiếp theo (cùng transaction)
sẽ ném lỗi `current transaction is aborted` thay vì chạy được (Postgres không tự phục hồi sau 1
statement lỗi trừ khi dùng SAVEPOINT). Tách 2 transaction độc lập tránh việc phải thêm SAVEPOINT
vào code idempotency đã ổn định của Friend Chat, mà vẫn giữ đúng tính chất cần thiết: **streak tự
nó luôn được cập nhật atomic + serialize đúng** nhờ `SELECT ... FOR UPDATE` khoá row
`conversation_streaks` bên trong transaction riêng của nó — 2 bên gửi message gần như đồng thời
vẫn tăng streak đúng 1 lần (test RACE trong `friend.integration.spec.ts`), không tăng đôi.

Streak lỗi (transaction thứ 2 fail) KHÔNG được rollback message đã gửi thành công — bắt lỗi, log,
tiếp tục trả về message bình thường (streak là phụ, không phải luồng chính).

## 3. Thuật toán tăng/reset — ngày lịch UTC, KHÔNG dùng giờ địa phương

Chốt (docs/06): mọi ngày dùng để so sánh là chuỗi `YYYY-MM-DD` derive từ `new Date().toISOString()`
tại **thời điểm server xử lý request** — không tin timezone client, không có khái niệm "ngày của
user A" khác "ngày của user B".

Trong `recordActivity(conversation, senderUserId)`:

1. Set `userLow`/`userHighLastActiveDate` = hôm nay cho bên gửi.
2. Nếu **cả 2 bên** đã có `lastActiveDate = hôm nay` VÀ `lastConfirmedDate != hôm nay` (chưa xác
   nhận hôm nay) → tính `gapDays = daysBetween(lastConfirmedDate, hôm nay)`:
   - `gapDays == null` (chưa từng confirm) hoặc `gapDays == 1` (hôm qua đã confirm) →
     `currentStreak += 1`.
   - `gapDays == 2` (lỡ đúng 1 ngày) → **grace cứu**: `currentStreak += 1` (KHÔNG reset), ghi
     `graceUsedForDate` = ngày bị lỡ.
   - `gapDays >= 3` → reset `currentStreak = 1`. `longestStreak` không bao giờ giảm.
   - `lastConfirmedDate` = hôm nay; nếu `currentStreak` trùng 1 mốc trong `STREAK_MILESTONE_DAYS`
     → trả `milestoneHit` cho caller publish realtime + notification.

**Quyết định chốt về grace (khác đề xuất `STREAK_GRACE_HOURS` ở plan gốc — ghi rõ vì lệch tên
config):** grace ở đây là **theo NGÀY lịch** (đúng 1 ngày lỡ được cứu), nhất quán với quyết định
"UTC calendar day" của toàn tính năng — không dùng đơn vị giờ cho biên grace để tránh lẫn 2 đơn vị
đo (ngày vs giờ) cho cùng 1 khái niệm. `graceUsedForDate` là dấu vết audit/idempotency (chống áp
grace 2 lần cho cùng 1 khoảng trống nếu code có bug retry), **không phải** tài nguyên giới hạn
dùng-hết-là-thôi — mỗi lần lỡ đúng 1 ngày đều được cứu, không giới hạn số lần trong lịch sử
conversation. Nếu sau này cần giới hạn số lần cứu (chống lạm dụng) hoặc grace nhiều ngày hơn, đó là
quyết định sản phẩm riêng — thêm `STREAK_GRACE_DAYS`/bộ đếm lúc đó, không tự đoán trước.

## 4. Read-path derive "đã hết" — không cron dọn 2 cột streak

`getDisplayStreak(conversationId)`: tính `gapDays` từ `lastConfirmedDate` đến hôm nay tại **thời
điểm đọc**. `isActive = gapDays <= 2` (còn trong hạn bình thường HOẶC còn cửa grace); `isActive =
false` → hiển thị `current = 0` dù cột DB `currentStreak` **chưa reset chính thức** (reset thật
chỉ xảy ra lúc có message mới đi qua `recordActivity`, cùng triết lý VIP downgrade/Party Room
grace — derive khi đọc, không cron ghi đè).

## 5. Cron cảnh báo "sắp mất" — KHÔNG BAO GIỜ ghi streak

`StreakWarningJob` (interval `STREAK_WARNING_CHECK_INTERVAL_MS`) mỗi tick gọi
`findConversationsNeedingWarning()`: chỉ chọn conversation có `currentStreak > 0`,
`lastConfirmedDate = hôm qua` (đúng gap=1 — hôm nay CHƯA xác nhận), giờ UTC hiện tại đã qua mốc
`STREAK_WARNING_HOURS`, và chưa cảnh báo hôm nay (`lastWarningSentAt`). Publish
`friend.streak.at_risk` + notification `streak_at_risk` cho CẢ 2 thành viên (không biết chắc bên
nào chưa nhắn, cảnh báo cả 2 để chắc ăn) rồi `markWarningSent`. Job này **chỉ đọc + ghi
`lastWarningSentAt`** — không bao giờ đổi `currentStreak`/`longestStreak`, đúng nguyên tắc chỉ
`recordActivity` (on-write thật) được ghi 2 cột đó.

## 6. Block chặn `sendMessage` sẵn → streak tự ngừng

Không cần logic riêng: `FriendService.sendMessage` đã throw nếu 2 bên block nhau (guard cũ), nên
`recordActivity` không bao giờ được gọi sau khi block — streak tự "đóng băng" và dần hiển thị
`isActive=false` qua read-path derive khi gap vượt quá 2 ngày.

## 7. Milestone — chỉ là hook, thưởng diamond ngoài phạm vi

`STREAK_MILESTONE_DAYS` (CSV, vd `3,7,14,30,50,100`) — trúng mốc thì publish
`friend.streak.increased` + notification `streak_milestone`. **Thưởng diamond (nếu làm sau) bắt
buộc đi qua `LedgerEntry` double-entry** — ngoài phạm vi W2. Streak Freeze mua bằng diamond là
hạng mục kế tiếp có case kinh doanh mạnh (xem plan gốc § 1) — khi làm phải thiết kế qua Economy.

## 8. Config

`STREAK_MILESTONE_DAYS` (CSV, mặc định `3,7,14,30,50,100`), `STREAK_WARNING_HOURS` (giờ UTC 0-23,
mặc định 20), `STREAK_WARNING_CHECK_INTERVAL_MS` (mặc định 3600000 — 1 giờ, vì cadence cảnh báo là
theo ngày, không cần quét dày).

## 9. Ngoài scope W2

- Streak Freeze mua bằng diamond (backlog, cần thiết kế qua Economy).
- Giới hạn số lần grace/lịch sử conversation (nếu cần chống lạm dụng — chưa có bằng chứng cần).
- Hiển thị streak trên FE (chưa có UI, chỉ có API `GET /conversations/:id/streak`).
