[← 02 · Domain Model](./02-domain-model.md) · **03 · Architecture** · [04 · Tech Stack →](./04-tech-stack.md)

# 3. Kiến trúc nền tảng — Modular Monolith trước, tách microservice theo tiêu chí rõ ràng

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
                │ internal API (REST/gRPC nội bộ)       │
                ▼                                       ▼
     ┌────────────────────┐                  ┌──────────────────┐
     │  Signaling Gateway  │                  │  (gọi Economy để  │
     │  (WebSocket, tách   │                  │   check/trừ tiền  │
     │   riêng vì connection│                  │   trước khi match)│
     │   -bound, không CPU) │                  └──────────────────┘
     └──────────┬──────────┘
                │ internal control API (không public)
                ▼
     ┌────────────────────┐
     │   Media Server      │
     │  (mediasoup — tách   │
     │   riêng bắt buộc,    │
     │   là C++ subprocess, │
     │   không business logic)│
     └────────────────────┘
```

**Chỉ 3 thành phần deploy riêng ngay từ đầu**: **core-api** (modular monolith chứa toàn bộ business logic), **Signaling Gateway**, **Media Server**. Còn lại tất cả tính năng (Auth, User, Matching, Economy, Social, Content, Moderation, Notification, Gift) sống chung trong `core-api` dưới dạng module NestJS tách biệt rõ ràng. **Đây là quy tắc quan trọng nhất trong toàn bộ tài liệu — nếu 1 đoạn code nào đó tạo ra 1 app/service thứ 4, dừng lại và hỏi lại trước khi tiếp tục.**

## 3.3 Vì sao Signaling Gateway + Media Server luôn phải tách riêng (2 ngoại lệ bắt buộc)

Đây không phải chọn theo sở thích — 2 lý do kỹ thuật rõ ràng:
- **Media Server (mediasoup)** vốn dĩ chạy dưới dạng subprocess C++ riêng biệt theo thiết kế của chính thư viện — không thể chung process với NestJS. Đây gọi là **Sidecar Pattern**: tầng signaling (biết ai đang ở phòng nào, quyền gì, gọi Economy Service để trừ tiền) tách khỏi tầng media (chỉ "cơ bắp" chuyển tiếp gói RTP, không có business logic, không query DB) — 2 tầng deploy như 2 container riêng nhưng luôn đi cùng nhau.
- **Signaling Gateway** cần scale theo số lượng **kết nối đồng thời** (connection-bound), khác hẳn quy luật scale của phần business logic (CPU/DB-bound) — nên tách riêng để scale ngang độc lập mà không kéo theo cả monolith.

## 3.4 Tiêu chí tách 1 module ra thành service riêng (dùng khi cần mở rộng sau này)

Chỉ tách 1 module ra khỏi `core-api` khi có **ít nhất 1** lý do cụ thể sau, không tách "cho giống công ty lớn":
1. Cần scale độc lập với tốc độ khác hẳn phần còn lại (đo được bằng số liệu thật, không phải dự đoán)
2. Cần công nghệ nền khác hẳn (vd cần chạy trên GPU, cần ngôn ngữ khác)
3. Cần cô lập bảo mật/tuân thủ riêng (vd Economy cần audit riêng theo luật tài chính)
4. Có 1 team khác sở hữu và cần chu kỳ deploy độc lập

Feed, Content, Avatar, Moderation, Notification gần như chắc chắn **không cần tách** cho tới khi có traffic thật đủ lớn.

## 3.5 mediasoup — cách scale đúng ngay từ đầu (tránh thiết kế sai)

- 1 **Worker** = 1 CPU core. 1 **Router** thường tương ứng 1 "room". Một worker chịu tải được khoảng 500 **consumer** (không phải 500 participant — mỗi participant trong phòng N người tạo ra N-1 consumer).
- Voice Match 1-1 rất nhẹ: mỗi người chỉ nhận từ 1 người kia → 2 consumer/room → 1 worker chứa được hàng trăm phòng 1-1 cùng lúc, không cần lo scale phức tạp ở giai đoạn đầu.
- Party Room (N người) nặng hơn nhiều vì consumer tăng theo N×(N-1) — cần giới hạn số speaker tối đa/phòng (config được) để 1 router không quá tải.
- Khi cần vượt quá 1 worker/host, dùng `pipeToRouter` để nối các router qua nhiều core hoặc nhiều host — đây là việc **vận hành ở quy mô lớn khi số liệu xác nhận cần** ([07-roadmap.md § Giai đoạn 7](./07-roadmap.md), § 3.8.A dưới đây), không phải việc dựng nền tảng ban đầu (Giai đoạn 0-2).

## 3.6 Xử lý giao dịch xuyên module (Match → Call → Billing) — Saga, không dùng 2PC

Luồng `Matching → Calling → Economy` chạm vào nhiều module, không thể bọc trong 1 transaction DB chung (dù đang là modular monolith thì các module *nên* coi dữ liệu của nhau là riêng biệt, để dễ tách service sau này mà không phải viết lại logic).

- Vì đây là luồng tuyến tính, khá ít bước (match found → call started → billing tick → call ended → settle cuối), lại là luồng đụng tới tiền cần audit rõ ràng — dùng **orchestration nhẹ**: 1 `CallOrchestratorService` gọi tuần tự từng bước, biết chính xác cách rollback (compensate) khi 1 bước fail giữa chừng. Orchestration phù hợp hơn choreography ở đây vì cho khả năng quan sát và kiểm soát rõ ràng — quan trọng khi tiền bạc liên quan.
- Các việc phụ không ảnh hưởng tính đúng đắn của giao dịch (gửi notification, ghi analytics khi call kết thúc) thì dùng **choreography** — publish event, module nào cần thì tự subscribe, không cần orchestrator biết tới. Đây là cách kết hợp hybrid: orchestration cho luồng chính liên quan tiền, choreography cho việc phụ.
- **Outbox Pattern là bắt buộc**: khi Economy module vừa update DB (trừ diamond) vừa cần publish event (`diamond.deducted`), phải ghi event vào bảng `outbox` trong **cùng transaction DB** với thao tác trừ tiền, sau đó 1 relay process riêng đọc `outbox` rồi mới publish ra ngoài — tránh tình trạng DB commit xong nhưng event bị mất (dual-write problem), lỗi rất hay gặp nếu bỏ qua pattern này.
- **Inbox Pattern / idempotency phía consumer**: mọi handler nhận event phải kiểm tra event đã xử lý chưa (dựa vào event id) trước khi xử lý — an toàn khi message bị gửi lại do retry.

## 3.7 Giao tiếp giữa các phần

- **Trong `core-api`** (giữa các module Auth/User/Matching/Economy...): gọi thẳng qua NestJS Dependency Injection (function call trong cùng process) — không cần REST/gRPC nội bộ vì cùng process, tiết kiệm rất nhiều độ phức tạp.
- **`core-api` ↔ Signaling Gateway ↔ Media Server**: internal API (REST hoặc gRPC nội bộ), không public ra ngoài internet.
- **Check/trừ diamond luôn đồng bộ + transaction DB**, không bao giờ qua async fire-and-forget.
- Khi 1 module thực sự cần tách thành service riêng sau này: vì đã thiết kế boundary/interface rõ từ đầu, chỉ cần đổi phần gọi trong-process thành gọi qua network — không phải viết lại logic nghiệp vụ.

## 3.8 Khi hệ thống thật sự lớn ngang Litmatch (không phải MVP) — những chỗ phải thiết kế lại từ đầu

> Mục 3.1–3.7 vẫn đúng làm **điểm khởi đầu** (modular monolith, chỉ tách Signaling + Media Server). Nhưng mục tiêu ở đây là chịu tải **hàng trăm nghìn – hàng triệu người dùng đồng thời** như Litmatch thật, nên có 3 quyết định cần chốt **ngay từ giai đoạn thiết kế**, vì đổi sau này tốn kém hơn nhiều so với đổi bây giờ. Phân biệt 2 việc khác nhau, để không mâu thuẫn với nguyên tắc MonolithFirst ở § 3.1: **quyết định thiết kế** (chọn đúng mô hình dữ liệu/kiến trúc ngay từ Giai đoạn 1-2 — xem [07-roadmap.md](./07-roadmap.md)) khác với **vận hành thật ở quy mô lớn** (bung thêm node/shard/region — chỉ làm khi số liệu traffic xác nhận cần, xem Giai đoạn 7). Cả 3 mục A/B/C dưới đây đều thuộc nhóm "quyết định thiết kế nên chọn đúng từ đầu":

### A. Lựa chọn SFU — cân nhắc LiveKit thay vì tự ghép mediasoup thô, nếu quy mô thật sự lớn

- mediasoup là **thư viện xây SFU**, không phải sản phẩm hoàn chỉnh: tự quản lý worker sống/chết, tự viết logic route signaling tới đúng worker cho từng phòng, tự viết cơ chế nối nhiều router qua nhiều host (`pipeToRouter`) khi vượt quá 1 máy — toàn bộ phần "distributed" này Litmatch-scale thật sự cần, mediasoup không cho sẵn.
- LiveKit đã đóng gói sẵn đúng bài toán này: cụm node LiveKit giống hệt nhau, đồng bộ qua Redis, 1 phòng có thể trải trên nhiều server vật lý, người dùng luôn nối vào node gần nhất — đây gọi là **cascading SFU / distributed mesh**, cùng ý tưởng với Octo của Jitsi nhưng LiveKit làm nó thành hành vi mặc định chứ không phải tính năng phải tự lắp. Một cụm LiveKit chạy được từ 1 tới hàng trăm node cùng cấu hình, và tài liệu LiveKit ghi nhận việc scale tới hàng triệu cuộc gọi đồng thời khi triển khai đúng theo mô hình mesh này.
- **Khuyến nghị**: bắt đầu vẫn có thể dùng mediasoup (rẻ, tự chủ) cho các giai đoạn đầu. Nhưng vì roadmap đã xác định rõ mục tiêu Litmatch-scale, nên **đánh giá lại và chọn LiveKit self-host (hoặc LiveKit Cloud) làm nền Media Server chính** trước khi viết nhiều logic phụ thuộc vào cấu trúc mediasoup — chuyển SFU giữa chừng khi đã có hàng trăm phòng sống là việc cực tốn công. Quy tắc chọn nhanh: 1 node SFU xử lý tốt tới vài nghìn publisher; vượt ngưỡng đó bắt buộc cascade nhiều node theo vùng — Party Room (multi-party, N người) chạm ngưỡng này sớm hơn Voice Match 1-1 rất nhiều vì số consumer tăng theo N×(N-1).

### B. Matching Queue phải shard theo tiêu chí + region ngay từ đầu, không chỉ 1 queue Redis duy nhất

- Ở quy mô lớn, matching không còn là "1 Redis list, 1 worker duyệt tuần tự". Cần tách theo mô hình dùng trong các hệ matchmaking thực tế: **ticket service** (đại diện 1 yêu cầu ghép, có state machine riêng: `queued → matched → confirmed → expired/cancelled`) tách khỏi **queue store** (nơi lưu trạng thái chờ, tối ưu cho việc matcher tìm nhanh ứng viên phù hợp) và **matcher worker** (stateless, có thể chạy nhiều instance song song).
- Bắt buộc **shard theo (loại match, region, dải tiêu chí lọc)** — vd Voice Match + khu vực Đông Nam Á + độ tuổi 20-25 là 1 shard riêng — để nhiều matcher instance chạy song song không dẫm chân lên cùng 1 tập user, giảm hotspot và giảm nhu cầu lock toàn cục.
- Dùng nguyên tắc **"double-lock ghép cặp"** (khoá bằng Redis `SETNX`/Lua script atomic khi lấy 2 user ra khỏi queue để ghép — xem thêm [10-code-review-checklist.md § Matching Service](./10-code-review-checklist.md)), áp dụng **theo từng shard** chứ không phải lock toàn bộ hệ thống matching.

### C. Economy/Wallet — thiết kế lại thành sổ cái kế toán kép (double-entry ledger), không phải 1 cột `balance` + bảng `transaction` log đơn thuần

- Cách làm phổ biến và an toàn nhất trong ngành fintech cho hệ tiền ảo ở quy mô lớn là dùng **double-entry ledger** thật sự — mỗi sự kiện tiền (nạp, trừ, gift, refund) được ghi thành **ít nhất 2 bút toán** (1 ghi Nợ, 1 ghi Có) vào 2 tài khoản nội bộ khác nhau (vd tài khoản `user_wallet:userId` và tài khoản `system_revenue` hoặc `gift_pool`), thay vì chỉ tăng/giảm 1 con số `balance`.
- Lợi ích khi hệ thống lớn: **balance luôn được tính lại (derive) từ tổng các bút toán ledger** thay vì tin vào 1 cột số dư có thể lệch do bug; hệ thống **tự cân đối được** (tổng Nợ luôn bằng tổng Có, sai lệch là phát hiện được ngay bằng 1 câu query); và có sẵn cấu trúc để **đối soát (reconciliation)** với dữ liệu từ Apple/Google IAP khi có tranh chấp.
- Balance hiển thị cho user (cần đọc nhanh) thì **cache/snapshot balance** như 1 dữ liệu dẫn xuất (derived), có thể rebuild lại bất cứ lúc nào từ ledger gốc nếu nghi ngờ sai lệch — không bao giờ coi bảng balance là nguồn sự thật (source of truth) duy nhất.
- Idempotency key bắt buộc là **unique constraint ở tầng DB** trên bảng ledger (không chỉ check-rồi-insert ở tầng code, vì đó vẫn có race condition) — request trùng idempotency key thì trả lại chính kết quả bút toán cũ, không tạo bút toán mới.
- Ở giai đoạn scale thật, cân nhắc PostgreSQL với constraint chặt + partition theo thời gian là đủ cho phần lớn trường hợp; chỉ cân nhắc engine ledger chuyên dụng (vd TigerBeetle) nếu throughput giao dịch tiền vượt quá khả năng Postgres đã tối ưu (đây là quyết định đo bằng số liệu thật, không phải mặc định).

---
[← 02 · Domain Model](./02-domain-model.md) · [04 · Tech Stack →](./04-tech-stack.md)
