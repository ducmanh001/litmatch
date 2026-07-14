# Discovery Service (module trong `core-api`) — đặc tả chi tiết

> W1 của [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)
> ([07-roadmap.md](../07-roadmap.md) Giai đoạn 2). Module `apps/core-api/src/modules/discovery`.
> Phạm vi tài liệu này: **browse-only** — filter theo gender/tuổi. Nearby (vị trí địa lý, filter
> khu vực cấp thành phố) chưa code, thuộc W5, xem plan gốc § 3.1.
>
> **Không có filter khu vực ở W1 (quyết định chốt 2026-07-14, phiên review-module verify):**
> `User.region` là field hạ tầng (LiveKit multi-region routing + shard hàng đợi Matching, ADR
> 0005; `UpdateProfileDto.region` chỉ nhận mã quốc gia 2 ký tự `^[A-Z]{2}$`, mặc định `'GLOBAL'`
> chỉ tồn tại in-memory ở Matching, không ghi DB) — **không phải** khu vực cấp thành phố cho
> dating. Tái dùng field này làm filter "khu vực" ở Discovery là sai giả định: không có đường ghi
> thật nào cho user có giá trị cấp thành phố (vd `HCM`/`HN`), nên filter sẽ luôn trả rỗng trên dữ
> liệu thật. Filter khu vực cấp thành phố thuộc về Nearby (W5) — dùng toạ độ quantize riêng
> (`user_locations`), không dùng `User.region`. Browse W1 chỉ còn gender + tuổi.

## 1. Khác gì với bộ lọc giới tính lúc ghép cặp (Matching)

Matching (`docs/services/matching-service.md § 2.1`) filter giới tính áp dụng **lúc ghép cặp
1-1** trong hàng đợi — 2 chiều, snapshot lên `MatchTicket`, chỉ có tác dụng tại thời điểm ghép.
Discovery là **màn duyệt/tìm chủ động, lặp lại nhiều lần** — user tự chọn tiêu chí mỗi lần gọi
API, không có state ticket/queue, không tạo `MatchTicket`/`MatchSession` nào. Đây là 2 khái niệm
độc lập, không dùng chung entity hay service.

## 2. Data model

Discovery **không sở hữu bảng riêng** ở W1 — chỉ query `User` (module `user` sở hữu) qua public
API mới `UserService.browsePage(filter, limit, after)`:

- `UserBrowseFilter`: `gender?`, `ageMin?`/`ageMax?` (server tự quy đổi sang khoảng `birthDate`,
  KHÔNG nhận field `age` thô từ client), `excludeUserIds?` (Discovery tự gộp
  `[viewer.id, ...hiddenUserIds]` trước khi gọi — User module trung lập, không biết khái niệm
  block/report), `excludeGuests?` (theo config `DISCOVERY_GUEST_VISIBLE`). Không có `region` — xem
  lý do ở khối cảnh báo đầu file.
- Keyset cursor `(createdAt, id)` giảm dần — cùng pattern `economy.service.ts`/`party-room.service.ts`
  cho bảng không có cột `seq`. Discovery tự decode/validate cursor (giữ error taxonomy đúng module
  sở hữu tính năng, không đẩy `DomainException` xuống `UserService`).
- Migration mới chỉ thêm 2 index trên `users` (`(status, gender, birth_date)` và
  `(created_at DESC, id DESC)`) — không đổi schema nghiệp vụ của User module.

## 3. Loại trừ block + report 2 chiều — `SafetyService.getHiddenUserIds`

Method mới trên `SafetyService` (public API, `safety/index.ts` không cần export thêm vì gọi qua
service có sẵn): hợp `getBlockedUserIds` (block active 2 chiều, tái dùng nguyên) với **report 2
chiều lấy trực tiếp từ bảng `reports`** — bất kỳ report nào từng tồn tại giữa 1 cặp (reporter hoặc
target) là đủ để ẩn nhau **vĩnh viễn** khỏi Discovery. Khác `SAFETY_REMATCH_COOLDOWN_DAYS` của
Matching (có cooldown, hết hạn thì ghép lại được) — quyết định chốt tại
[docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 6](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md),
lý do: Discovery là màn duyệt lặp lại nhiều lần/ngày, không giống ghép cặp 1 lần.

## 4. Card Discovery — composition, không sửa `PublicProfileDto`

`PublicProfileDto` (User module) được Soul Match dùng để reveal profile sau khi match và Friend
module dùng cho danh sách bạn — cả 2 nơi đó có bất biến "giữ ẩn danh: không tuổi chính xác,
không region chi tiết" từ trước (comment tường minh trong code). Thêm `ageBucket` thẳng vào DTO
đó sẽ rò rỉ tuổi vào 2 luồng không liên quan tới Discovery.

Discovery trả `DiscoveryCardDto { profile: PublicProfileDto; ageBucket: string | null }` —
composition, KHÔNG sửa DTO gốc. `ageBucket` tính từ `birthDate` theo mốc config
`DISCOVERY_AGE_BUCKETS` (CSV tăng dần, vd `18,25,31,41` → bucket `18-24`, `25-30`, `31-40`,
`41+`), không lộ tuổi chính xác. `birthDate = null` → `ageBucket = null` (không đoán tuổi).

## 5. Guest + banned

- `status != active` (banned) luôn loại — derive khi đọc qua điều kiện query, không cron.
- Guest loại theo config `DISCOVERY_GUEST_VISIBLE` (mặc định `false`, chống farm guest làm loãng
  pool — cùng tinh thần `docs/06 § Chống farm guest`).

## 6. CTA sau khi thấy user — chỉ xem profile (MVP)

Repo hiện KHÔNG có friend-request/"say hi" — chat chỉ mở khi đã là bạn qua Soul/Voice Match.
Quyết định chốt 2026-07-14: Discovery W1 **chỉ cho xem profile**, không có hành động tiếp theo
nào khác. Hệ quả đã ghi nhận: graph bạn bè hiện chỉ đến từ match, audience `friends` của
Stories/Streak (backlog khác) phụ thuộc số friendship hình thành — theo dõi số liệu trước khi
quyết định có mở friend-request flow không (không tự mở rộng scope).

## 7. Ngoài scope W1

- Không có nearby/vị trí địa lý — xem plan gốc § 3.1 cho thiết kế đầy đủ (quantize + jitter +
  reciprocity + ghost mode hoãn lại).
- Không có endpoint xem chi tiết 1 user qua Discovery (`GET /discovery/:userId`) — chỉ có
  `GET /discovery/browse` (list). Xem chi tiết dùng thẳng `GET /users/:id` sẵn có.
- Không lưu/ghi nhớ filter đã dùng (server-side saved search) — mỗi lần gọi client tự truyền lại.
