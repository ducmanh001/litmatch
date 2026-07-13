[← 02 · Domain Model](./02-domain-model.md) · **03 · Architecture** · [04 · Tech Stack →](./04-tech-stack.md)

# 3. Kiến trúc nền tảng — Modular Monolith trước, tách microservice theo tiêu chí rõ ràng

Các nguyên tắc ownership, boundary, dependency direction và tiêu chí tách service
được tóm tắt tại [11-engineering-principles.md](./11-engineering-principles.md).

> Nguyên tắc "MonolithFirst" của Martin Fowler, cách các hệ thống video/voice thật sự scale, saga pattern cho giao dịch phân tán. KHÔNG chia 7-8 microservice ngay từ đầu — đó là premature optimization.

## 3.1 Vì sao không chia nhiều microservice ngay từ đầu

Nghiên cứu thực tế cho thấy phần lớn tổ chức làm tốt hơn với 1 **modular monolith** thiết kế module rõ ràng, thay vì nhảy thẳng vào microservices — chỉ nên tách service khi 1 phần cụ thể thực sự gây nghẽn vận hành (vd cần GPU riêng, cần cô lập compliance riêng), lúc đó tách ra "sạch" vì ranh giới module đã rõ từ đầu, không phải gỡ rối 1 mớ bòng bong. Đây chính là nguyên tắc **MonolithFirst** của Martin Fowler: làm cho chạy được, làm cho đúng, rồi mới phân tán đúng phần cần phân tán. Các công ty như Shopify, Gusto, Appsmith cũng đi theo hướng modular monolith thay vì microservices ngay từ đầu.

Chia 8 service từ ngày 0 nghĩa là: 8 lần deploy, 8 lần theo dõi log, 8 network boundary phải xử lý lỗi mạng, trong khi ở giai đoạn đầu chưa có traffic nào cần tách riêng cả. Đó là chi phí thừa cần tránh.

## 3.2 Kiến trúc đề xuất

```
┌─────────────────────────────────────────────────────────────┐
│         core-api (NestJS Modular Monolith — 1 process)       │
│                                                                │
│   auth/  user/  matching/  economy/  social/  content/        │
│   moderation/  notification/  gift/                           │
│                                                                │
│   Mỗi module: boundary rõ, chỉ giao tiếp qua interface export, │
│   có ArchUnit-style test chặn import chéo trái phép            │
└───────────────┬─────────────────────────────────────┬────────┘
                │ Redis pub/sub delta                 │ LiveKit server SDK/control API
                ▼                                     ▼
     ┌────────────────────┐                 ┌────────────────────┐
     │ Signaling Gateway  │                 │ Media Server       │
     │ Socket.IO fanout,  │                 │ LiveKit self-host, │
     │ không business     │                 │ không business/DB  │
     └────────────────────┘                 └────────────────────┘
```

**Baseline chỉ có 3 thành phần deploy riêng**: **core-api** (modular monolith chứa toàn bộ
business logic), **Signaling Gateway**, **Media Server**. Còn lại tất cả tính năng sống trong
`core-api` dưới dạng module NestJS. Nếu số liệu vận hành sau này đạt § 3.4, việc tạo deployable
thứ tư là thay đổi architecture: phải có ADR mới cập nhật `AGENTS.md`, file này, guard và
deployment trong cùng thay đổi; không được tạo app trước rồi hợp thức hoá tài liệu sau.

## 3.3 Vì sao Signaling Gateway + Media Server luôn phải tách riêng (2 ngoại lệ bắt buộc)

Đây không phải chọn theo sở thích — 2 lý do kỹ thuật rõ ràng:

- **Media Server (LiveKit self-host)** có lifecycle, tài nguyên và quy luật scale riêng với
  NestJS. `core-api` giữ business state/quyền và gọi LiveKit qua port bọc server SDK; LiveKit chỉ
  chuyển tiếp media, không chứa business logic hoặc query DB. Signaling Gateway không nằm trên
  đường điều khiển media hiện tại — nó fanout delta sau khi core-api đã quyết định/commit.
- **Signaling Gateway** cần scale theo số lượng **kết nối đồng thời** (connection-bound), khác hẳn quy luật scale của phần business logic (CPU/DB-bound) — nên tách riêng để scale ngang độc lập mà không kéo theo cả monolith.

## 3.4 Tiêu chí tách 1 module ra thành service riêng (dùng khi cần mở rộng sau này)

Chỉ tách 1 module ra khỏi `core-api` khi có **ít nhất 1** lý do cụ thể sau, không tách "cho giống công ty lớn":

1. Cần scale độc lập với tốc độ khác hẳn phần còn lại (đo được bằng số liệu thật, không phải dự đoán)
2. Cần công nghệ nền khác hẳn (vd cần chạy trên GPU, cần ngôn ngữ khác)
3. Cần cô lập bảo mật/tuân thủ riêng (vd Economy cần audit riêng theo luật tài chính)
4. Có 1 team khác sở hữu và cần chu kỳ deploy độc lập

Đạt một tiêu chí chỉ cho phép **đề xuất** tách; quyết định cuối phải có số liệu, ADR và kế hoạch
migration/rollback. Cho tới khi ADR đó được accept, guard "ba deployable" vẫn là luật cứng.

Feed, Content, Avatar, Moderation, Notification gần như chắc chắn **không cần tách** cho tới khi có traffic thật đủ lớn.

## 3.5 Capacity model của LiveKit self-host

- Khi cấu hình Redis, các node LiveKit chia sẻ room data/message bus và chọn node còn tải để host
  **room mới**. Cách này scale ngang tốt theo số lượng room và cho phép drain node an toàn.
- Giới hạn quan trọng: với LiveKit self-host hiện hành, **một room phải nằm vừa trên một node**.
  Thêm node không tự chia một Party Room lớn thành nhiều SFU. Signaling có thể đi qua node khác,
  nhưng media room vẫn do node được chọn host.
- Voice Match 1-1 tạo nhiều room nhỏ nên hưởng lợi trực tiếp từ scale ngang theo room. Party Room
  có fan-out lớn hơn; tải phụ thuộc số publisher/subscriber, số track, codec, bitrate và egress,
  không được dùng một con số participant/consumer chung cho mọi cấu hình.
- Vì vậy `PARTY_MAX_SPEAKERS` và `PARTY_MAX_MEMBERS` là giới hạn an toàn bắt buộc. Chỉ nới sau
  load test với đúng profile production và headroom đã định; nếu một room vượt khả năng một node,
  cần ADR chọn node lớn hơn, đổi topology/provider hoặc giới hạn sản phẩm — không gọi việc thêm
  node là "cascade room".

## 3.6 Xử lý giao dịch xuyên module (Match → Call → Billing) — Saga, không dùng 2PC

Luồng `Matching → Calling → Economy` chạm vào nhiều module, không thể bọc trong 1 transaction DB chung (dù đang là modular monolith thì các module _nên_ coi dữ liệu của nhau là riêng biệt, để dễ tách service sau này mà không phải viết lại logic).

- Vì đây là luồng tuyến tính, khá ít bước (match found → call started → billing tick → call ended → settle cuối), lại là luồng đụng tới tiền cần audit rõ ràng — dùng **orchestration nhẹ**: 1 `CallOrchestratorService` gọi tuần tự từng bước, biết chính xác cách rollback (compensate) khi 1 bước fail giữa chừng. Orchestration phù hợp hơn choreography ở đây vì cho khả năng quan sát và kiểm soát rõ ràng — quan trọng khi tiền bạc liên quan.
- Các việc phụ không ảnh hưởng tính đúng đắn của giao dịch (gửi notification, ghi analytics khi call kết thúc) thì dùng **choreography** — publish event, module nào cần thì tự subscribe, không cần orchestrator biết tới. Đây là cách kết hợp hybrid: orchestration cho luồng chính liên quan tiền, choreography cho việc phụ.
- **Outbox Pattern là bắt buộc**: khi Economy module vừa update DB (trừ diamond) vừa cần publish event (`diamond.deducted`), phải ghi event vào bảng `outbox` trong **cùng transaction DB** với thao tác trừ tiền, sau đó 1 relay process riêng đọc `outbox` rồi mới publish ra ngoài — tránh tình trạng DB commit xong nhưng event bị mất (dual-write problem), lỗi rất hay gặp nếu bỏ qua pattern này.
- **Inbox Pattern / idempotency phía consumer**: mọi handler nhận event phải kiểm tra event đã xử lý chưa (dựa vào event id) trước khi xử lý — an toàn khi message bị gửi lại do retry.

## 3.7 Giao tiếp giữa các phần

- **Trong `core-api`** (giữa các module Auth/User/Matching/Economy...): gọi thẳng qua NestJS Dependency Injection (function call trong cùng process) — không cần REST/gRPC nội bộ vì cùng process, tiết kiệm rất nhiều độ phức tạp.
- **`core-api` → Signaling Gateway**: publish realtime delta qua Redis pub/sub sau commit;
  gateway xác thực socket và fanout, không quyết định business.
- **`core-api` → Media Server**: gọi LiveKit control API qua port dùng server SDK để mint token,
  tạo/xoá room và đổi grant; client nối trực tiếp LiveKit bằng token TTL ngắn. API key/secret
  không public ra internet.
- **Check/trừ diamond luôn đồng bộ + transaction DB**, không bao giờ qua async fire-and-forget.
- Khi 1 module thực sự cần tách thành service riêng sau này: vì đã thiết kế boundary/interface rõ từ đầu, chỉ cần đổi phần gọi trong-process thành gọi qua network — không phải viết lại logic nghiệp vụ.

## 3.8 Khi hệ thống thật sự lớn ngang Litmatch (không phải MVP) — những chỗ phải thiết kế lại từ đầu

> Mục 3.1–3.7 vẫn đúng làm **điểm khởi đầu** (modular monolith, chỉ tách Signaling + Media Server). Nhưng mục tiêu ở đây là chịu tải **hàng trăm nghìn – hàng triệu người dùng đồng thời** như Litmatch thật, nên có 3 quyết định cần chốt **ngay từ giai đoạn thiết kế**, vì đổi sau này tốn kém hơn nhiều so với đổi bây giờ. Phân biệt 2 việc khác nhau, để không mâu thuẫn với nguyên tắc MonolithFirst ở § 3.1: **quyết định thiết kế** (chọn đúng mô hình dữ liệu/kiến trúc ngay từ Giai đoạn 1-2 — xem [07-roadmap.md](./07-roadmap.md)) khác với **vận hành thật ở quy mô lớn** (bung thêm node/shard/region — chỉ làm khi số liệu traffic xác nhận cần, xem Giai đoạn 7). Cả 3 mục A/B/C dưới đây đều thuộc nhóm "quyết định thiết kế nên chọn đúng từ đầu":

### A. Lựa chọn và biên scale của SFU

- **Đã chốt (ADR 0001): LiveKit self-host là Media Server chính từ Giai đoạn 2.** `core-api`
  chỉ phụ thuộc port của media provider; không rò type SDK vào domain để vẫn có đường đổi provider.
- Cụm nhiều node dùng Redis để chia sẻ room state/message bus. Khi tạo room, LiveKit chọn một node
  đủ tải; node nhận signal có thể làm bridge tới node đang host room. Điều này scale số room và
  tăng redundancy, nhưng không xoá biên một room/một node nêu ở § 3.5.
- Multi-region cần đo latency và placement thực tế: room mới ưu tiên node phù hợp theo region/load;
  người vào room đang tồn tại phải đi tới room đó, không được hứa mọi participant luôn có media
  path gần nhất.
- **Đã chốt (ADR 0005)**: networking RTC multi-node trong k8s dùng `hostNetwork: true`
  (`k8s/base/media-server`). Tầng ứng dụng chọn endpoint theo region qua `LIVEKIT_REGION_URLS`
  (map region → URL, fallback `LIVEKIT_URL`; mọi URL cùng MỘT cụm LiveKit chung Redis): Party Room
  ghim URL theo region của host lúc tạo (snapshot cột `livekit_url`), Calling resolve theo region
  của userA trong session (2 bên cùng region theo shard matching § 3.8.B). ADR 0005 KHÔNG đổi trần
  "một room vừa một node" — tăng replica media-server vẫn chờ benchmark thật.
- Edge/API Gateway expose core-api/signaling-gateway đã chốt nginx-ingress (ADR 0004).
- Capacity phải được chứng minh bằng benchmark theo workload của dự án và dashboard production.
  Không dùng con số marketing hoặc benchmark khác codec/bitrate làm SLO. Party Room phải giữ cap
  cứng cho tới khi có bằng chứng tải; nhu cầu room lớn hơn một node là một quyết định kiến trúc mới.
- Đổi provider hoặc topology phải tạo ADR mới và sửa file này + [04-tech-stack.md](./04-tech-stack.md)
  trước khi code.
- Scaffolding cho việc benchmark/SLO/cảnh báo (Giai đoạn 7): profile load test Party Room
  (`loadtest/party-room-livekit.sh`, dùng `lk load-test` — k6 không mở được kết nối WebRTC thật),
  mục tiêu SLO/headroom (`loadtest/party-room-slo.yaml`) và rule cảnh báo Prometheus theo node
  (`k8s/base/media-server/prometheus-alerts.yaml`) đã có sẵn nhưng **chưa từng chạy với LiveKit
  cluster production thật** — xem `loadtest/README.md` mục 4 trước khi tin số liệu.

### B. Matching Queue phải shard theo tiêu chí + region ngay từ đầu, không chỉ 1 queue Redis duy nhất

- Ở quy mô lớn, matching không còn là "1 Redis list, 1 worker duyệt tuần tự". Cần tách theo mô hình dùng trong các hệ matchmaking thực tế: **ticket service** (đại diện 1 yêu cầu ghép, có state machine riêng: `queued → matched → confirmed → expired/cancelled`) tách khỏi **queue store** (nơi lưu trạng thái chờ, tối ưu cho việc matcher tìm nhanh ứng viên phù hợp) và **matcher worker** (stateless, có thể chạy nhiều instance song song).
- Bắt buộc **shard theo (loại match, region, dải tiêu chí lọc)** — vd Voice Match + khu vực Đông Nam Á + độ tuổi 20-25 là 1 shard riêng — để nhiều matcher instance chạy song song không dẫm chân lên cùng 1 tập user, giảm hotspot và giảm nhu cầu lock toàn cục.
- Dùng nguyên tắc **"double-lock ghép cặp"** (khoá bằng Redis `SETNX`/Lua script atomic khi lấy 2 user ra khỏi queue để ghép — xem thêm [10-code-review-checklist.md § Matching Service](./10-code-review-checklist.md)), áp dụng **theo từng shard** chứ không phải lock toàn bộ hệ thống matching.

### C. Economy/Wallet — thiết kế lại thành sổ cái kế toán kép (double-entry ledger), không phải 1 cột `balance` + bảng `transaction` log đơn thuần

- Cách làm phổ biến và an toàn nhất trong ngành fintech cho hệ tiền ảo ở quy mô lớn là dùng **double-entry ledger** thật sự — mỗi sự kiện tiền (nạp, trừ, gift, refund) được ghi thành **ít nhất 2 bút toán** (1 ghi Nợ, 1 ghi Có) vào 2 tài khoản nội bộ khác nhau (vd tài khoản `user_wallet:userId` và tài khoản `system_revenue` hoặc `gift_pool`), thay vì chỉ tăng/giảm 1 con số `balance`.
- Lợi ích khi hệ thống lớn: **balance luôn được tính lại (derive) từ tổng các bút toán ledger** thay vì tin vào 1 cột số dư có thể lệch do bug; hệ thống **tự cân đối được** (tổng Nợ luôn bằng tổng Có, sai lệch là phát hiện được ngay bằng 1 câu query); và có sẵn cấu trúc để **đối soát (reconciliation)** với dữ liệu từ Apple/Google IAP khi có tranh chấp.
- Balance hiển thị cho user (cần đọc nhanh) thì **cache/snapshot balance** như 1 dữ liệu dẫn xuất (derived), có thể rebuild lại bất cứ lúc nào từ ledger gốc nếu nghi ngờ sai lệch — không bao giờ coi bảng balance là nguồn sự thật (source of truth) duy nhất.
- Idempotency key bắt buộc là **unique constraint ở tầng DB**, đặt trên bảng `Transaction` (1 key cho cả giao dịch nghiệp vụ) — **KHÔNG đặt unique trên bảng `LedgerEntry`**: mỗi giao dịch tạo ≥2 bút toán cùng thuộc 1 key, unique ở tầng ledger sẽ chặn chính bút toán thứ 2 của giao dịch hợp lệ. Các `LedgerEntry` trỏ về `transaction_id`. Không chỉ check-rồi-insert ở tầng code (vẫn có race condition) — request trùng idempotency key thì trả lại chính kết quả giao dịch cũ, không tạo bút toán mới.
- Snapshot `Wallet.balance` được cập nhật trong **cùng transaction DB** với thao tác append bút toán ledger (không async qua event) — nhờ đó bước "check đủ diamond trước khi trừ" dựa trên snapshot + `SELECT ... FOR UPDATE` là an toàn. Chỉ chuyển sang cập nhật async khi số liệu thật cho thấy contention thực sự — và khi đó phải thiết kế lại luôn cả bước check số dư đi kèm, không đổi lẻ 1 nửa.
- Ở giai đoạn scale thật, cân nhắc PostgreSQL với constraint chặt + partition theo thời gian là đủ cho phần lớn trường hợp; chỉ cân nhắc engine ledger chuyên dụng (vd TigerBeetle) nếu throughput giao dịch tiền vượt quá khả năng Postgres đã tối ưu (đây là quyết định đo bằng số liệu thật, không phải mặc định).
- Job đối soát (Giai đoạn 7) chạy **2 tier theo chi phí**: tier fast (bất biến Nợ=Có theo currency + orphan receipt — 1 câu aggregate) chạy dày (`ECONOMY_RECONCILIATION_FAST_INTERVAL_MS`, mặc định 60s), tier deep (sample ví so snapshot↔derived) giữ cadence thưa (`ECONOMY_RECONCILIATION_INTERVAL_MS`, mặc định 300s). Lệch/run lỗi được export qua Prometheus (`economy_reconciliation_mismatch_total` theo check+currency, `economy_reconciliation_last_run_status` theo tier, `economy_reconciliation_run_duration_seconds`) để alert rule fire tự động — job **read-only tuyệt đối**, sửa lệch thật luôn đi qua reversal entry ở write path chuẩn.

---

[← 02 · Domain Model](./02-domain-model.md) · [04 · Tech Stack →](./04-tech-stack.md)
