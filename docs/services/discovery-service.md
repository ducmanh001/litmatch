# Discovery Service (module trong `core-api`) — đặc tả chi tiết

> W1 + W4 của [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)
> ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/discovery`.
> Phạm vi tài liệu này: **browse** (§ 1-7, W1, filter gender/tuổi) + **Nearby** (§ 8, W4, vị trí
> địa lý quantize + jitter). CTA "mời Voice/Soul Match" từ browse/nearby sống ở module `matching`
> — xem [matching-service.md § Invite](./matching-service.md).
>
> **Không có filter khu vực ở browse (quyết định chốt 2026-07-14, phiên review-module verify):**
> `User.region` là field hạ tầng (LiveKit multi-region routing + shard hàng đợi Matching, ADR
> 0005; `UpdateProfileDto.region` chỉ nhận mã quốc gia 2 ký tự `^[A-Z]{2}$`, mặc định `'GLOBAL'`
> chỉ tồn tại in-memory ở Matching, không ghi DB) — **không phải** khu vực cấp thành phố cho
> dating. Tái dùng field này làm filter "khu vực" ở Discovery là sai giả định: không có đường ghi
> thật nào cho user có giá trị cấp thành phố (vd `HCM`/`HN`), nên filter sẽ luôn trả rỗng trên dữ
> liệu thật. Filter khu vực cấp thành phố thuộc về Nearby (§ 8) — dùng toạ độ quantize riêng
> (`user_locations`), không dùng `User.region`. Browse chỉ còn gender + tuổi.

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

## 6. CTA sau khi thấy user — xem profile + mời Voice/Soul Match (W4)

Repo KHÔNG có friend-request/"say hi" — chat chỉ mở khi đã là bạn qua Soul/Voice Match (double-
like). W1 chỉ cho xem profile; **W4 bổ sung CTA "mời Voice/Soul Match"** — directed invite tái
dùng nguyên pipeline `MatchTicket`/`MatchSession` sẵn có, KHÔNG phải friend-request flow mới. Đây
là mitigation chính cho rủi ro graph bạn bè sparse (browse/nearby chỉ xem profile là ngõ cụt cho
dating app). Thiết kế chi tiết, state machine, rate-limit chống spam: xem
[matching-service.md § Invite](./matching-service.md#invite) — Discovery/Nearby chỉ là nơi UI lấy
`inviteeUserId`, không sở hữu logic invite.

## 7. Ngoài scope

- Không có endpoint xem chi tiết 1 user qua Discovery (`GET /discovery/:userId`) — chỉ có
  `GET /discovery/browse` (list). Xem chi tiết dùng thẳng `GET /users/:id` sẵn có.
- Không lưu/ghi nhớ filter đã dùng (server-side saved search) — mỗi lần gọi client tự truyền lại.
- Ghost mode (ẩn nearby có chọn lọc, khác tắt hẳn `nearbyVisible`) hoãn lại — không scaffold cột
  riêng, chỉ dùng reciprocity làm cơ chế ẩn/hiện duy nhất (chốt 2026-07-14, xem plan gốc § 6).

## 8. Nearby (W4) {#nearby}

Mở rộng module `discovery` — 2 bảng mới sở hữu bởi chính module này (không đụng `users`):
`user_locations` (1:1 user — `latQuantized`/`lonQuantized`, `updatedAt` để derive độ tươi) và
`discovery_settings` (1:1 user — `nearbyVisible` mặc định **false**, opt-in).

### 8.1 3 lớp chống trilateration

1. **Quantize tại nguồn** (`DISCOVERY_LOCATION_QUANTIZE_DEGREES`, mặc định `0.0045°` ≈ 500m ở vĩ
   độ Việt Nam) — `NearbyService.setLocation` làm tròn NGAY LÚC GHI, `user_locations` không bao
   giờ chứa toạ độ thô. Ước lượng gần đúng (kinh độ co lại theo `cos(lat)`), chấp nhận sai số cho
   MVP.
2. **Jitter tất định theo cặp-theo-ngày** (`nearby.constants.ts#nearbyJitterKm`, pattern FNV-1a
   tái dùng từ Palm Match, hash function dùng chung ở `common/hash/fnv1a.ts`) — cộng thêm lượng
   lệch cố định trong 1 ngày UTC cho 1 cặp user cụ thể trước khi tính bucket hiển thị. Đổi ngày →
   jitter đổi (chống suy luận qua nhiều ngày). **Không phải cơ chế crypto** — cùng cảnh báo gốc
   của palm-match, đây là defense-in-depth chống dò quét thô sơ, không chống adversary có nguồn
   lực lớn (ghi nhận ở review-module plan W4, chấp nhận rủi ro đã biết).
3. **Rate limit** ghi vị trí (`DISCOVERY_LOCATION_UPDATE_RATE_LIMIT_PER_HOUR`) và truy vấn nearby
   (`DISCOVERY_NEARBY_QUERY_RATE_LIMIT_PER_HOUR`) — Redis INCR+EXPIRE+Lua atomic dùng chung
   (`common/redis/rate-limit.ts`), cùng pattern speed-up của Matching.

API **không bao giờ** trả toạ độ/khoảng cách chính xác — chỉ `distanceBucket` (CSV mốc tăng dần
`DISCOVERY_DISTANCE_BUCKETS_KM`, vd `1,3,5,10,20` → `<1km`, `1-3km`, ... `20km+`). Logger redact
`lat`/`lon`/`latQuantized`/`lonQuantized` (`libs/logger/src/lib/redact.ts`).

### 8.2 Reciprocity + exclusion

Chưa opt-in `nearbyVisible` thì **không xem được** nearby của người khác (check chính user gọi
API trước khi query — không phải cơ chế ẩn 1 chiều). Tắt `nearbyVisible` xoá `user_locations`
CÙNG transaction — không giữ toạ độ cũ. Vị trí quá `DISCOVERY_LOCATION_FRESHNESS_HOURS` tự biến
mất khỏi kết quả (derive khi đọc, không cron riêng). Loại trừ banned/guest/block/report — cùng bộ
luật với browse (`SafetyService.getHiddenUserIds`, `UserService.findActiveByIds` mới thêm để
User module áp lại đúng 1 bộ luật "user hợp lệ để hiện", tránh Discovery tự chế luật riêng).

### 8.3 Spatial MVP — bounding-box + haversine

Không dùng PostGIS. Query candidate: bounding-box prefilter bằng btree index thường trên
`(lat_quantized, lon_quantized)` (`idx_user_locations_lat_lon`), giới hạn
`DISCOVERY_NEARBY_CANDIDATE_CAP` dòng; sort/cursor-pagination + haversine chính xác + jitter tính
ở tầng app. Đây là **deferred optimization đã biết** (không phải vấn đề đúng-sai): thiết kế gốc
plan § 3.1 đề xuất snapshot Redis TTL ~120s cho pagination ổn định, W4 chọn query trực tiếp mỗi
lần (đúng theo nguyên tắc "correctness trước cache/performance", docs/03 § boundary) — nâng cấp
snapshot/PostGIS không đổi data model nếu cần scale sau.
