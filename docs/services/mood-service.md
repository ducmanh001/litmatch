# Mood Service (module trong `core-api`) — đặc tả chi tiết

> W1 phần preset của [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)
> ([07-roadmap.md](../07-roadmap.md) Giai đoạn 2). Module `apps/core-api/src/modules/mood`.
> Phạm vi tài liệu này: **preset-only** — free-text (cần `ModerationPort` thật, repo hiện chưa có
> hệ moderation text nào) là backlog, chưa code.

## 1. Data model

- `mood_presets`: catalog data-driven (pattern `avatar_assets`) — `code` (unique), `label`,
  `emoji`, `active`, `sortOrder`. Danh sách thật chỉnh qua seed migration/admin sau, không hardcode
  trong code.
- `mood_status_events`: **append-only tuyệt đối** — set/clear đều là 1 dòng mới, không
  update/xoá dòng cũ. Không có cột `status` (approve/pending) ở W1 vì preset auto-approve; cột đó
  thêm bằng migration mới khi ship free-text (backlog, không scaffold trước — docs/11).
  - `kind`: `'set' | 'clear'`. `kind='set'` bắt buộc có `presetId` + `expiresAt`; `kind='clear'`
    cả hai đều NULL (CHECK constraint enforce ở DB).
  - `idempotencyKey`: **unique ở DB** — set/clear đều bắt buộc header `Idempotency-Key`
    (`IdempotencyKey` decorator sẵn có), service tự prefix theo `kind` + `userId`
    (`mood.constants.ts`) để trùng key thô từ client không đụng giữa 2 user hoặc 2 hành động.

## 2. "Mood hiện tại" — derive khi đọc, không cron

Không có job dọn/hết hạn. Đọc dòng **mới nhất** của user (`ORDER BY createdAt DESC LIMIT 1`):

- Không có dòng nào → không có mood.
- Dòng mới nhất `kind='clear'` → không có mood (bất kể có set trước đó bao lâu).
- Dòng mới nhất `kind='set'` nhưng `expiresAt <= now()` (giờ server tại **thời điểm đọc**) →
  không có mood — cùng triết lý derive-khi-đọc như VIP downgrade/Party Room grace, không cần
  cron riêng vì không có tài nguyên (SFU, ledger...) cần dọn.
- Ngược lại → mood active, trả thông tin preset.

Re-set cùng preset (user bấm lại preset đang active) vẫn tạo dòng mới — **refresh TTL**, không
phải bug: user "khẳng định lại" mood vẫn đúng là hành động hợp lệ.

## 3. Hiển thị public — composition, không sửa `PublicProfileDto`

`MoodService.getPublicMood(viewerId, targetId)` là public API dùng qua DI (friend list, discovery
card, profile...) — **không** thêm field mood vào `PublicProfileDto` dùng chung ở Soul Match
reveal + Friend list.

- Ẩn 2 chiều nếu có **block active** (`SafetyService.getBlockedUserIds`) — khác
  `SafetyService.getHiddenUserIds` của Discovery (không xét report; block và report có ngữ nghĩa
  khác nhau, xem docs/10 § Discovery). Re-check block **mỗi lần gọi** (không cache) — đúng tinh
  thần xác minh lại đúng thời điểm đọc (docs/10 § 10.0.C), không snapshot 1 lần.
- Xem mood chính mình (`viewerId === targetId`) bỏ qua bước check block.
- **KHÔNG được gọi hàm này ở card ẩn danh trước-match Soul Match** — giữ invariant ẩn danh
  (docs/06). Đây là kỷ luật ở call site (không wire `MoodService` vào luồng anonymous), không có
  cờ nào trong service tự chặn được vì service không biết ngữ cảnh gọi.

## 4. Preset-only W1 — không có moderation

- `presetCode` client gửi phải khớp `mood_presets.code` đang `active=true`, sai →
  `MOOD_PRESET_NOT_FOUND` (404), không lộ danh sách preset đã tắt.
- Không có free-text ở W1 → không cần `ModerationPort`/blocklist/admin review queue. Khi ship
  free-text (backlog), preset vẫn auto-approve như cũ; chỉ free-text mới cần trạng thái duyệt.

## 5. Config

`MOOD_STATUS_TTL_HOURS` (mặc định 24) — TTL snapshot vào `expiresAt` lúc set, đổi config không ảnh
hưởng mood đã set trước đó (đã snapshot).

## 6. Ngoài scope W1

- Free-text mood + `ModerationPort` (blocklist + admin review queue) — backlog, xem plan gốc § 3.5.
- "Ai đang cùng mood quanh đây" (nối với Nearby/Discovery) — điểm nối tương lai, chưa thiết kế.
- Không đưa mood lên card ẩn danh trước-match Soul Match (§ 3).
