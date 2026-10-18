# 2026-10-17 — Realtime, ghép đôi và chat ở quy mô 10 triệu đồng thời

Bản ghi có ngày cho checkout `d3cb28c` cộng thay đổi chưa commit của phiên này (làm 2026-10-17, hoàn tất
và verify 2026-10-18). **Không phải chứng nhận capacity production**: mọi số đo chạy trên máy dev
(Redis/Postgres trong Docker), mọi con số mô hình là giả định có ghi nguồn. Quy tắc hiện hành nằm ở
[realtime-gateway § 5–7](../services/realtime-gateway.md), [matching § 2–3](../services/matching-service.md),
[roadmap § 7.3](../07-roadmap.md#73-lộ-trình-quy-mô-từ-vài-user-tới-vài-tỷ) và
[plan capacity 2026-10-08](./2026-10-08-capacity-and-scaling-plan.md) (10 triệu CCU thuộc mốc **S7**).

## 1. Kết luận ngắn

- Hệ thống **chưa thể** được chứng nhận 10 triệu CCU, cả trước lẫn sau thay đổi này: chưa có load test
  ở quy mô đó, Postgres vẫn là một primary, media server một replica, và 10 triệu CCU là bài toán nhiều
  cell/region (plan 2026-10-08 § 4, S6–S7), không phải bài toán một cụm.
- Đã loại bốn nút thắt **trong code** mà đo/đọc mã chứng minh được (§ 3), mỗi cái có test thật và đường
  lùi bằng cấu hình (§ 4). Nút thắt nghiêm trọng nhất về chức năng là **matcher bị chặn ở đầu hàng đợi**:
  mô phỏng cho thấy chỉ 46% ticket được ghép khi đa số user chọn "khác giới" (§ 5.2).
- Một reviewer độc lập (model khác, chỉ đọc mã) tìm thêm 3 lỗi nặng và 8 lỗi nhẹ trong chính thay đổi
  này; phần lớn đã sửa (§ 10), trong đó có lỗi nghiêm trọng nhất do sharding: một shard Redis hỏng làm
  cả gateway NotReady.
- Phần còn lại cần hạ tầng hoặc quyết định (§ 7): Redis shard, Postgres (pool, partition, retention),
  LiveKit, autoscale theo kết nối, **OTP đang trả thẳng trong response** (bảo mật), và kiến trúc cell.

## 2. Objective, phạm vi, acceptance

- **Objective:** gỡ các nút thắt scale ngang trong realtime gateway, matcher và đường gửi tin nhắn bạn bè;
  lập kế hoạch cho phần cần hạ tầng/quyết định.
- **Out of scope:** provision hạ tầng, đổi schema/migration, provider mới (SMS), thêm deployable, sharding
  Postgres/ledger, multi-region, chạy tải vào deployment thật, audit đường nóng của các module ngoài
  realtime/matching/chat bạn bè (xem § 7 H) — các module đó vẫn có thể là nút thắt ở quy mô này.
- **Acceptance:** (1) mỗi phát hiện có bằng chứng (mã hoặc số đo); (2) mỗi thay đổi có unit + integration
  test trên Postgres/Redis thật và đường lùi bằng cấu hình; (3) ba invariant của AGENTS.md không đổi (ba
  backend; ledger không bị chạm; quality gate); (4) phần còn lại có gate và người quyết định rõ.
- **Checks:** `pnpm agent:verify signaling`, `pnpm agent:verify matching`, `pnpm capacity:test`,
  `pnpm docs:check`, `pnpm format:check`. `review-module: verify` cho Matching ở § 6. Economy: không chạm
  (speed-up và mua lượt match giữ nguyên).

## 3. Phát hiện (bằng chứng ở HEAD `d3cb28c`)

| #   | Nút thắt                                                                                                                                                                                                                                        | Bằng chứng                                                                                                                                                                                                                                                                                                                                                                                           | Hệ quả ở quy mô đề bài                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| F1  | Matcher chỉ pop 2 ticket đầu shard; cặp không khớp giới/bị block được trả lại rồi **dừng shard** (`matcher-worker.service.ts` `drainShard`, nhánh `requeued_pair` → `break`)                                                                    | Spec ghi là trade-off chấp nhận (`matching-service.md` § 2.1 cũ). Mô phỏng `scripts/capacity/matching-hol-sim.mjs` (§ 5.2).                                                                                                                                                                                                                                                                          | Đầu shard kẹt tới khi hết hạn 120 s → trượt SLO ghép đôi (99,5% ghép ≤30 s)           |
| F2  | Mọi gateway pod `PSUBSCRIBE realtime:user:*` và `JSON.parse` mọi event trước khi biết user có ở pod không (`signaling.gateway.ts` `relay`, `psubscribe`)                                                                                        | `loadtest/realtime-plane-bench.mjs`: CPU Redis mỗi event 3 → 13 → 57 µs khi 1 → 10 → 40 pod (tăng tuyến tính theo số pod).                                                                                                                                                                                                                                                                           | Ở 220 pod mỗi event tốn hàng trăm µs: pub/sub trở thành nút thắt dù tải event rất nhỏ |
| F3  | Mỗi socket một `setInterval` và một `EVAL` Lua mỗi lease/3; Redis đóng kết nối quota thì **ngắt mọi socket của pod** (`connection-quota.service.ts` `close`/`end` → `notifyUnavailable`, `signaling.gateway.ts` `disconnectActiveQuotaSockets`) | Bench: 29 µs/lệnh. Mô hình: 11 triệu socket → 367.000 lệnh/giây. Một lần Redis chớp = cả đàn socket rớt rồi reconnect dồn vào đúng Redis đang hồi phục.                                                                                                                                                                                                                                              | Trần ~1 triệu socket trên một Redis; sự cố Redis ngắn thành sự cố toàn hệ thống       |
| F4  | Mỗi tin nhắn bạn bè chạy một transaction streak (INSERT ON CONFLICT + `SELECT FOR UPDATE` + save) dù hầu hết là no-op (`friend.service.ts` → `StreakService.recordActivity`)                                                                    | Đọc mã: ≈5 round trip và một row lock mỗi tin, trong tổng ≈18 câu lệnh/tin.                                                                                                                                                                                                                                                                                                                          | 3.000 tin/giây ≈ 15.000 câu lệnh/giây lãng phí                                        |
| F5  | **Không đổi trong phiên này** (cần hạ tầng hoặc quyết định)                                                                                                                                                                                     | OTP trả trong response (`otp.service.ts:65`); mỗi tin bạn bè tạo một notification + push (`friend.service.ts` cuối `sendMessage`); HPA gateway tối đa 20 pod, core-api 10 (`k8s/base/*/hpa.yaml`); `DATABASE_POOL_MAX` mặc định 10 và PgBouncer chưa kiểm chứng (`k8s/README.md` § ngân sách kết nối); media server 1 replica; bảng message/ticket/session/notification chưa có partition/retention. | Xem § 7                                                                               |

## 4. Thay đổi đã làm

| #   | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                | File chính                                                                                                                                                                 | Đường lùi                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C1  | Gateway chỉ `SUBSCRIBE` channel của user có socket trên pod; handshake xong sau khi subscribe được xác nhận (socket thứ hai gặp shard đang reconnect thì subscribe lại và fail closed); tự subscribe lại khi Redis nối lại; `relay` kiểm room trước khi parse; shutdown không gửi UNSUBSCRIBE từng user                                                                                 | `realtime-fanout.ts`, `signaling.gateway.ts`                                                                                                                               | `WS_FANOUT_MODE=pattern`                                                                           |
| C2  | Gia hạn lease gộp lô (một timer/pod, pipeline `EVALSHA`, pha rải ngẫu nhiên). Redis lỗi **không** ngắt ngay; `lost` thì **cấp lại** trước (Redis restart mất dữ liệu); mốc ngắt quét độc lập với gia hạn; callback lỗi không làm mất theo dõi socket khác                                                                                                                               | `lease-refresher.ts`, `connection-quota.service.ts`                                                                                                                        | Image cũ (không có cờ — đây là thay đổi hành vi có chủ đích)                                       |
| C3  | Chia Redis theo userId cho pub/sub + presence/quota; core-api publish và đọc presence theo cùng hàm hash                                                                                                                                                                                                                                                                                | `libs/common-dtos/.../realtime-shards.ts`, `libs/config-validator/.../realtime-redis-urls.ts`, `sharded-realtime-publisher.adapter.ts`, `redis-presence-reader.adapter.ts` | `REALTIME_REDIS_URLS` rỗng = một shard = `REDIS_URL` (cũ)                                          |
| C4  | Metric gateway: kết nối, user đang subscribe, lease theo dõi, shard sẵn sàng/tổng, kết quả relay/gia hạn (`ok`/`reacquired`/`lost`/`error`)                                                                                                                                                                                                                                             | `signaling.metrics.ts`                                                                                                                                                     | —                                                                                                  |
| C5  | Matcher: cửa sổ ứng viên (đọc, không pop), `claimPair` atomic, `canPair` lọc lúc chọn VÀ quyết định lại dưới lock (mỗi lần một truy vấn SQL thay vì bốn — Movie/Palm Match cũng hưởng), cache cặp bị chặn, drain shard song song có chặn theo pool, wake-up đến lúc tick đang chạy được gộp (chạy lại), trả cặp về hàng đợi nếu transaction lỗi sau claim, shard 1 ticket không bị đụng | `matcher-worker.service.ts`, `redis-matching-queue.adapter.ts`, `matching-queue.port.ts`, `safety.service.ts` (`canPair`)                                                  | `MATCHING_MATCHER_CANDIDATE_WINDOW=2`, `…_CONCURRENCY=1`, `MATCHING_MATCHER_UNPAIRABLE_CACHE_MS=0` |
| C6  | Streak: đọc không khoá, bỏ qua transaction khi người gửi đã được ghi nhận hôm nay                                                                                                                                                                                                                                                                                                       | `streak.service.ts`                                                                                                                                                        | Image cũ (bất biến chứng minh ở mã)                                                                |
| C7  | Công cụ: benchmark Redis, mô hình năng lực, mô phỏng head-of-line                                                                                                                                                                                                                                                                                                                       | `loadtest/realtime-plane-bench.mjs`, `scripts/capacity/*`                                                                                                                  | —                                                                                                  |
| C8  | Readiness theo shard: pod ready khi **ít nhất một** shard phục vụ được (body báo `realtimeShards: "k/N"`), khởi động chỉ cần một shard lên — một shard hỏng chỉ làm user của shard đó fail closed lúc handshake thay vì rút cả gateway khỏi load balancer                                                                                                                               | `signaling.gateway.ts` (`shardStatus`), `connection-quota.service.ts` (`onModuleInit`), `health.controller.ts`                                                             | Một shard (mặc định) cho đúng hành vi cũ                                                           |

Mọi thay đổi tương thích triển khai cuốn chiếu: channel `realtime:user:{id}` và schema DB không đổi.
Pod matcher cũ (`ZPOPMIN`) và mới (`claimPair`) chạy chung an toàn: pop/claim đều atomic nên bên thua
chỉ thấy `false`/rỗng, `ZADD NX` khi trả lại không nhân đôi.

## 5. Số đo và mô hình

### 5.1 Redis (đo — `node loadtest/realtime-plane-bench.mjs`, Redis 7 trong Docker, 20.000 user)

| Gia hạn lease                | µs CPU Redis/lệnh |
| ---------------------------- | ----------------: |
| `EVAL` từng socket (trước)   |                29 |
| `EVALSHA` từng socket        |                26 |
| `EVALSHA` pipeline 200 (sau) |                16 |

| Fanout, 40.000 event  | 1 pod | 10 pod | 40 pod |
| --------------------- | ----: | -----: | -----: |
| `PSUBSCRIBE` (trước)  |  3 µs |  13 µs |  57 µs |
| `SUBSCRIBE` theo user |  3 µs |   4 µs |   7 µs |

Đọc **tỉ lệ**, không đọc số tuyệt đối (Docker trên Windows). Chạy lại trên Redis production trước khi mua
hạ tầng theo số này.

### 5.2 Head-of-line của matcher (mô phỏng — `node scripts/capacity/matching-hol-sim.mjs`)

Một shard, λ = 2 ticket/giây, hết hạn 120 s. Phân bố **giả định**: 30% "bất kỳ", 65% "khác giới",
5% "cùng giới", nam 50%. Thay bằng số liệu sản phẩm thật trước khi kết luận.

| Cửa sổ             | Ghép được | Hết hạn | Chờ p50 | Chờ p95 |
| ------------------ | --------: | ------: | ------: | ------: |
| 2 (cũ)             |     46,2% |   50,3% |   118 s |   119 s |
| 8                  |     95,2% |    2,5% |    78 s |   115 s |
| 16                 |     99,8% |    0,2% |     0 s |    37 s |
| 32 (mới, mặc định) |      100% |      0% |     0 s |     9 s |

Với quần thể 70% "bất kỳ" cửa sổ 2 vẫn chỉ ghép 69,8% (hết hạn 26,7%). Cửa sổ chỉ giải quyết đầu hàng
đợi **không đồng nhất**; nếu cả cửa sổ đồng nhất (shard lệch giới) thì vẫn dừng — ticket mới vào có
score cao nhất nên nằm cuối hàng và không tự chen vào cửa sổ. Đo bằng metric
`matching_matcher_windows_total{outcome="stalled"}`.

### 5.3 Mô hình năng lực (`pnpm capacity:model`, giả định ghi trong `DEFAULTS`)

Kịch bản đề bài: 10 triệu CCU, 10.000 người đang chat (0,3 tin/giây), 10 triệu lượt ghép/ngày (đỉnh ×10).

| Hạng mục                                                 |         Trước |                         Sau |
| -------------------------------------------------------- | ------------: | --------------------------: |
| Pod gateway (50.000 socket/pod, giả định)                |           220 |                         220 |
| Gia hạn lease (lệnh/giây, lease 90 s)                    |       366.667 |                     366.667 |
| CPU Redis lease + pub/sub (core)                         |    10,6 + 5,7 |                  5,9 + 0,09 |
| Redis shard tối thiểu (≤50% CPU/shard)                   |            33 |                          12 |
| …nếu lease 300 s, gia hạn mỗi 100 s                      |            18 |                           4 |
| Postgres (câu lệnh/giây ở đỉnh, 20.000/primary giả định) |        52.204 |                      42.389 |
| Ghép đôi đỉnh / pod matcher                              |    1.157/giây | 18 pod (giả định 30 ms/cặp) |
| Voice đồng thời / node media (2.000 người/node)          | 347.222 người |                   ≥290 node |

Bài học của mô hình: sau cải tiến, **gia hạn lease** là chi phí Redis chính ở 10 triệu CCU (nên chọn độ
dài lease và số shard), pub/sub gần như hết đáng kể; Postgres cần nhiều hơn một primary ở tải chat +
ghép đề bài — con số phụ thuộc hoàn toàn vào giả định 20.000 câu lệnh/giây/primary cần đo thật. Số câu
lệnh mỗi cặp giảm ≈14 → 12: `canPair` chạy hai lần (lọc + quyết định dưới lock) nhưng mỗi lần chỉ một truy vấn
thay vì bốn (C5); nếu không gộp, kiểm lại dưới lock sẽ làm số này tăng lên ≈18.

## 6. `review-module verify` — Matching

Luồng: `joinQueue` → `ZADD` shard → wake-up → đọc cửa sổ (`peekWindow`) → đọc ticket + user → chọn cặp
(gender 2 chiều + `canPair` làm bộ lọc) → `claimPair` → transaction (lock, verify lại gồm `canPair`,
session, `UPDATE` ticket, notification) → publish realtime + push sau commit.

| #   | Giả định                                | Vector phá / hậu quả                                               | Vị trí chặn (file:line)                                                                                                                                                                                                                  | Verdict    |
| --- | --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Một ticket không nằm trong hai cặp      | Hai matcher chọn cùng ticket → ghép đôi                            | `redis-matching-queue.adapter.ts:11` (`CLAIM_PAIR_SCRIPT`: ZSCORE cả hai rồi ZREM) + `matcher-worker.service.ts:466` (lock) và `:526` (`UPDATE … WHERE status='queued'`, `affected` phải là 2); test "race 4 ticket" và "2 matcher tick" | ✅         |
| 2   | Gender/trạng thái/ban kiểm tại lúc ghép | User đổi gender/bị ban/cancel giữa lúc chọn và lúc lock            | `matcher-worker.service.ts:456` (`confirmPair`) đọc lại ticket (FOR UPDATE) + user trong transaction; nhánh `dropped` trả bên còn hợp lệ                                                                                                 | ✅         |
| 3   | Block/report kiểm tại lúc ghép          | Block phát sinh giữa lúc chọn cặp và lúc commit (gồm chờ pool)     | `canPair` chạy hai lần: lọc ở `:387` và quyết định lại dưới lock ở `:504`, như bản cũ (đọc qua connection khác; song song ≤ ¼ pool: `:257`). Còn lại cửa sổ vài ms giữa `canPair` trong transaction và commit — cùng loại với bản cũ     | ✅         |
| 4   | Redis không phải nguồn sự thật          | Ticket cancelled/banned còn trong Redis                            | `matcher-worker.service.ts:303` (`matchWindow`) phân loại → `:435` (`discard`) gỡ khỏi Redis / expire; test zombie + banned                                                                                                              | ✅         |
| 5   | Không mất lượt chờ                      | Ticket không được chọn bị đổi score                                | Cửa sổ chỉ đọc (`redis-matching-queue.adapter.ts:57`); bên còn hợp lệ trả với score gốc (`ZADD NX`); transaction lỗi sau claim cũng trả cả hai (`matcher-worker.service.ts:587`); test score không đổi + test transaction lỗi            | ✅         |
| 6   | Crash giữa claim và transaction         | 2 ticket mất khỏi Redis, DB vẫn `queued`                           | Sweeper expire sau `MATCHING_QUEUE_MAX_WAIT_SECONDS` (`ticket-sweeper.service.ts:99`); chaos test (bán kính vẫn 2 ticket)                                                                                                                | ✅         |
| 7   | Ưu tiên (speed-up) và công bằng         | Ticket mới chen trước ticket cũ                                    | Cửa sổ theo score tăng dần; ticket cũ nhất luôn chọn đối tác trước (`:362` `findPair`); test speed-up + thứ tự ưu tiên                                                                                                                   | ✅         |
| 8   | Pool không deadlock                     | Transaction giữ kết nối rồi chờ kết nối thứ hai (`canPair`)        | Không có vòng chờ vì các tác vụ khác không chờ matcher; song song ≤ ¼ `DATABASE_POOL_MAX` (`:257`) để matcher không chiếm hết pool; hết pool thì transaction lỗi và cặp được trả lại (`:587`)                                            | ✅         |
| 9   | Wake-up không bị mất                    | Ticket vào shard đã xử lý xong, tick đang chạy → chờ backstop 10 s | `matcher-worker.service.ts:200` (`runOnce`): đặt cờ `rerunRequested` (`:212`), tick đang chạy chạy lại ngay (tối đa 4 vòng); test coalescing                                                                                             | ✅         |
| 10  | Cặp bị chặn không làm kẹt vĩnh viễn     | Cặp block/report ở đầu cửa sổ bị hỏi lại mỗi wake-up               | Cache `MATCHING_MATCHER_UNPAIRABLE_CACHE_MS` (`:384`, `:390`) + trần 4 lần `canPair` chưa-cache (`:385`); chỉ có thể làm CHẬM (vd sau khi bỏ chặn), không cho ghép cặp bị cấm vì quyết định cuối là `:504`; test cache bật/tắt           | ✅         |
| 11  | Cửa sổ đồng nhất vẫn có thể kẹt         | Shard lệch giới: 32 nam cùng chỉ muốn nữ ở đầu                     | Metric `matching_matcher_windows_total{outcome="stalled"}`; hướng xử lý: hàng đợi theo nhóm giới (quyết định sản phẩm)                                                                                                                   | ⚠️ còn lại |

Lỗi tìm thấy khi làm: (a) `matched += await drainShard()` ghi đè lẫn nhau giữa các worker song song (đếm
thiếu 2/5 cặp) — đã sửa, có test shard song song; (b) Prettier tách `this.dataSource\n.transaction(` làm
hỏng guard ADR 0012 (`persistence-boundaries.spec.ts` kiểm bằng regex) — viết lại để chuỗi nằm một dòng.

## 7. Kế hoạch còn lại

| Giai đoạn                         | Việc                                                                                                                                                                                                                                                                                                                                                                                          | Gate để chuyển                                                                                                                                              | Ai quyết / cần gì                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| **A. Làm ngay (chặn production)** | OTP: bỏ `code` khỏi response, gửi qua SMS provider, giới hạn theo số điện thoại/IP                                                                                                                                                                                                                                                                                                            | Không còn đường đăng nhập chỉ bằng biết số điện thoại                                                                                                       | Chủ sản phẩm: provider + chi phí                |
| **B. Hạ tầng realtime**           | Dựng N Redis shard (HA từng shard), đặt `REALTIME_REDIS_URLS` giống nhau ở core-api và gateway; chọn độ dài lease (90 s → 300 s nếu chấp nhận slot ma tối đa 5 phút sau khi pod chết); HPA gateway theo `signaling_connections_active` (prometheus-adapter), nâng `maxReplicas`; `terminationGracePeriodSeconds`/preStop để rớt socket có nhịp; alert `signaling_redis_shards_ready < _total` | Staging 1 triệu → 3 triệu socket: p95 handshake, tỉ lệ `lost`/`error`/`reacquired`, CPU từng shard ≤ 50%; game day: failover một shard + restart cuốn chiếu | Platform on-call; ngân sách Redis               |
| **C. Dữ liệu**                    | PgBouncer (kiểm chứng advisory lock qua pooler), read replica cho đọc chấp nhận trễ, partition theo thời gian + retention cho `messages`, `soul_chat_messages`, `match_tickets`, `match_sessions`, `notifications`; chính sách lưu trữ                                                                                                                                                        | Đo `pg_stat_statements` thay cho giả định 20.000/primary; restore drill trên dung lượng thật                                                                | Chủ sản phẩm + pháp lý (lưu trữ tin nhắn); DBA  |
| **D. Chat**                       | Gộp/bỏ notification + push cho tin nhắn khi người nhận đang online (đã có presence) hoặc đã có thông báo chưa đọc của hội thoại                                                                                                                                                                                                                                                               | Giảm ≥80% insert `notifications` ở tải chat đo được, không mất push khi offline                                                                             | Chủ sản phẩm (hành vi thông báo)                |
| **E. Matching chất lượng**        | Đo `stalled`; nếu đáng kể: hàng đợi theo nhóm giới tính/preference (hoặc đọc sâu hơn cửa sổ khi shard stalled)                                                                                                                                                                                                                                                                                | `stalled` < ngưỡng thống nhất; p95 chờ trong SLO                                                                                                            | Chủ sản phẩm                                    |
| **F. Media**                      | Benchmark LiveKit audio 1–1 theo node, autoscale node, vùng                                                                                                                                                                                                                                                                                                                                   | Số người/node đo được; call setup p95 < 10 s ở tải đỉnh                                                                                                     | Realtime on-call                                |
| **G. Cell/region**                | ADR cell (plan 2026-10-08 S6–S7): mỗi cell một cụm đầy đủ (gateway, Redis shard, Postgres) với giới hạn đã benchmark; 10 triệu CCU ≈ nhiều cell                                                                                                                                                                                                                                               | Mất một cell không kéo sập cell khác; chuyển user giữa cell được diễn tập                                                                                   | Kiến trúc + ADR; ledger không ACID xuyên cell   |
| **H. Audit module còn lại**       | Chỉ đọc mã đường nóng của short-video, mini-game, soul/movie/palm-match, avatar, mood, notification, admin và economy (ví, quà, IAP): ước số câu lệnh Postgres/Redis mỗi thao tác, chỗ thiếu phân trang/index, N+1, khoá hàng nóng; thêm hàng cho từng module vào `capacity:model`                                                                                                            | Mỗi module có số câu lệnh/thao tác và nút thắt được nêu tên; `capacity:model` phản ánh; danh sách việc sửa xếp theo rủi ro                                  | Chỉ cần thời gian đọc mã (1–2 agent, read-only) |

## 8. Triển khai và lùi

- **Gateway:** triển khai cuốn chiếu bình thường. Lùi fanout: `WS_FANOUT_MODE=pattern`. Gia hạn lease không
  có cờ lùi (image cũ). Readiness mới chỉ khác khi có nhiều shard.
- **Matcher:** `MATCHING_MATCHER_CANDIDATE_WINDOW=2` + `MATCHING_MATCHER_CONCURRENCY=1` +
  `MATCHING_MATCHER_UNPAIRABLE_CACHE_MS=0` ≈ hành vi cũ (không còn pop/requeue). Theo dõi
  `matching_matcher_windows_total{outcome}` và `matching_ticket_wait_seconds`.
- **Bật shard Redis:** quy trình ở [realtime-gateway § 7](../services/realtime-gateway.md). Cửa sổ hai app lệch
  nhau làm mất event của user đổi shard (REST polling bù) — làm ngoài giờ cao điểm.
- **Dùng thử cục bộ không Docker compose của người dùng:** `docker run` từng container Redis/Postgres đặt tên
  riêng rồi `docker rm -f`; không chạy `pnpm infra:up` (khởi động cả container khác). Postgres cần
  `-c max_connections=400` để chạy toàn bộ suite core-api song song.

## 9. Bằng chứng kiểm chứng

Chạy trên Postgres 16 + Redis 7 thật (container tạm), 2026-10-17 → 19; lần chạy cuối sau mọi sửa mã:

| Lệnh                                                      | Kết quả                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm agent:verify signaling` (full)                      | PASS: `agent:check`; `agent:test` 150/150 (gồm `scripts/capacity/*.test.mjs`); `format:check`; lint; test 15 suite / 119 test (4 suite integration trên Redis thật, gồm `signaling.sharded` với hai Redis); build; e2e gateway 2/2 |
| `pnpm agent:verify matching` (full)                       | PASS: `agent:check`; `agent:test` 150/150; `openapi:check`; `format:check`; lint; test core-api 104 suite / 1.062 test, không skip (19 suite integration trên Postgres 16 + Redis 7 thật); build                                   |
| `nx test common-dtos config-validator`                    | 5 suite / 41 test (hàm hash shard, parser `REALTIME_REDIS_URLS`)                                                                                                                                                                   |
| `pnpm docs:check` (7-Zip thay `zip`/`unzip` trên Windows) | PASS sau khi sinh lại `docs/generated`                                                                                                                                                                                             |
| Benchmark Redis, mô hình năng lực, mô phỏng head-of-line  | Số đo ở § 5                                                                                                                                                                                                                        |

Lỗi do chính lượt chạy cuối bắt được (đã sửa, rồi chạy lại từ đầu): (a) e2e readiness của gateway còn kỳ vọng
hai check, thiếu `realtimeShards: "1/1"` của C8 — cập nhật spec; (b) `module-boundaries.spec.ts` (ratchet docs/03 § 3.2)
báo test `canPair` mới import thẳng file nội bộ của module `safety` — đổi sang import qua public API `../safety`,
snapshot nợ cũ vẫn khớp, không tăng nợ; (c) hai lần fail do môi trường, không do mã (máy bị tiến trình khác chiếm CPU:
gateway e2e không mở cổng trong 30 s; `nx show project` vượt 45 s timeout cứng của `verify.mjs`) — chạy lại từng gate
một mình sau khi làm nóng Nx graph.

Chưa kiểm chứng: tải ở quy mô triệu socket; hành vi trình duyệt khi Redis chớp (client không biết đã lỡ
event — dựa vào REST polling); số µs trên Redis production; giả định hồ sơ giới tính/preference thật;
đường nóng của các module chưa audit cho quy mô này (short-video, mini-game, soul/movie/palm-match, avatar, mood,
admin). `signaling.sharded.integration` chỉ chạy khi có hai Redis khác nhau (`INTEGRATION_REDIS_SHARD_URLS`; không
đặt biến thì spec tự skip) — lượt chạy cuối đã chạy với hai container.

## 10. Nhật ký review độc lập

Lần 1 (model opus) thất bại ngay do giới hạn tuần của tài khoản (HTTP 429), không có kết quả. Lần 2
(model sonnet, chỉ đọc mã, không chạy test) trả 3 lỗi nặng + 8 nhẹ; đã đối chiếu từng cái với mã:

| #   | Phát hiện                                                                                 | Xử lý                                                                                                                                                                                     |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `docs:check` sẽ hỏng (báo cáo sinh tự động lưu file:line đã đổi)                          | Đúng. Sinh lại `docs/generated` bằng `pnpm docs:generate`; thêm `docs:check` vào checks (§ 2)                                                                                             |
| 2   | Một shard hỏng làm cả gateway NotReady và pod mới không khởi động                         | Đúng. Sửa (C8): ready khi ≥1 shard, `onModuleInit` chỉ cần 1 shard, metric + `realtimeShards`                                                                                             |
| 3   | `signaling.integration.spec` chờ `PUBSUB NUMPAT` — chỉ đúng nhờ suite khác chạy song song | Đúng. Chờ `gateway.isReady()`; đã chạy riêng suite này và pass                                                                                                                            |
| 4   | Mốc ngắt lease phụ thuộc tick gia hạn đang chờ Redis; "trần không bao giờ vượt" quá mạnh  | Đúng. Thêm `sweepExpired` độc lập, biên ≥ 2 tick; mô tả trong docs đã nới cho đúng. Chưa làm: chạy chunk song song trong một shard (trần 5.000 gia hạn/giây/pod được ghi trong docs)      |
| 5   | Socket thứ hai của user dùng promise subscribe cũ khi shard đang reconnect                | Đúng. Subscribe lại (idempotent) khi shard chưa sẵn sàng                                                                                                                                  |
| 6   | Head-of-line mới giải quyết một phần; cache/quét sâu; docs sai về "chen vào cửa sổ"       | Một phần. Thêm cache cặp bị chặn (cấu hình được) và đếm trần theo lần chưa-cache; sửa docs. Chưa làm: đọc sâu hơn khi stalled (lợi ích ≤2% theo mô phỏng; có metric)                      |
| 7   | `canPair` không còn kiểm lại dưới lock                                                    | Đúng. Kiểm lại trong transaction (như bản cũ); sửa mô tả                                                                                                                                  |
| 8   | Wake-up bị bỏ khi tick đang chạy                                                          | Đúng (có từ trước, nặng hơn khi tick dài). Cờ `rerunRequested` chạy lại ngay                                                                                                              |
| 9   | `void this.tick()` không catch; callback ném lỗi làm mất theo dõi các socket còn lại      | Đúng. `.catch` + try/catch từng callback                                                                                                                                                  |
| 10  | `lost` ngắt ngay kể cả khi Redis mất dữ liệu                                              | Đúng. Cấp lại lease trước, chỉ ngắt khi hết slot                                                                                                                                          |
| 11  | Nhiều chi tiết docs/config                                                                | Sửa: điền kết quả, cách nêu guard (không phải "unique index"), file:line ở § 6, cảnh báo khi `WS_CONNECTION_LEASE_REFRESH_MS` bị cắt, comment PSUBSCRIBE cũ, bão UNSUBSCRIBE khi shutdown |

Reviewer xác nhận không có lỗi trong: streak đường nhanh, định tuyến shard giữa core-api và gateway (và
mặc định không đổi), `admit()` ở cả ba điểm await, matcher cũ/mới chạy chung, và không còn `x += await`.
