# 0011. Hybrid modular monolith, layered modules và event-driven có chọn lọc

- **Ngày**: 2026-07-30
- **Trạng thái**: Accepted
- **Liên quan**: docs/03-architecture.md § 3.2–3.7, docs/11-engineering-principles.md,
  docs/16-module-blueprint.md

## Bối cảnh

Hệ thống đã có modular monolith, outbox Economy, Redis realtime và Nx monorepo, nhưng các thuật ngữ
“layered”, “Clean Architecture” và “event-driven” chưa có một decision matrix thống nhất. Áp dụng
thuần một trường phái cho mọi module sẽ hoặc để boundary chỉ nằm trên tài liệu, hoặc tạo nhiều
interface/model/service không mang giá trị. Ngược lại, thiếu guard khiến project browser/server,
module import và root layout có thể trôi dần khi nhiều người/agent làm song song.

Ràng buộc không đổi: chỉ ba backend component; business nằm trong `core-api`; Economy ledger
append-only/double-entry; thao tác tiền và policy cần kết quả đồng bộ, transaction và idempotency.

## Quyết định

1. Giữ `core-api` là modular monolith theo bounded context. Module production chỉ giao tiếp qua
   public `index.ts` + Nest provider export và graph dependency không có cycle.
2. Áp dụng pragmatic Clean/layered architecture theo compile-time dependency: inbound adapter →
   application facade/use case → domain contract/port; outbound adapter → port. Module class là
   composition root nối implementation vào port. Job/worker hiện hữu có thể sở hữu transaction
   persistence trong domain của nó khi batch/locking/idempotency cần atomic boundary, nhưng
   application/domain không được phụ thuộc ngược vào job. Không bắt module đơn giản tạo
   folder/abstraction để dành.
3. Dùng synchronous DI và transaction DB hiện hữu cho command/query cần kết quả hoặc atomicity
   xuyên module. Application orchestrator chỉ điều phối use case nhiều bước khi giúp làm rõ thứ tự;
   không dựng distributed saga giả trước khi có network boundary. Event chỉ cho reaction có thể
   tách sau commit.
4. Event durable dùng transactional outbox, at-least-once và consumer inbox/dedup; realtime
   ephemeral dùng Redis delta riêng và không là source of truth.
5. Monorepo enforce ba chiều tag `type:*`, `scope:*`, `platform:*`. Project browser chỉ phụ thuộc
   browser-compatible, project server chỉ phụ thuộc server-compatible; lib cross-runtime khai cả
   hai capability.
6. Chuyển đổi theo ratchet: chặn debt mới bằng architecture test, giữ exception legacy tường minh,
   dọn từng lát khi module được chạm; không big-bang rewrite.

Integration event durable mới dùng envelope tối thiểu:

```text
id, type, version, occurredAt, payload
optional: correlationId, causationId
```

Thêm field là backward-compatible; đổi nghĩa/xoá field phải lên version. Khi một aggregate/stream
cần ordering, producer key theo aggregate/stream đó; không hứa global order hoặc exactly-once.
Consumer durable mới phải có idempotency/inbox trước khi được dùng cho side effect.

## Phương án đã loại & lý do

- **Một microservice cho mỗi domain** — tăng deploy/network/observability/consistency cost khi chưa
  có số liệu đạt tiêu chí tách service.
- **Choreography/event cho mọi tương tác** — che transaction boundary, khó debug và không phù hợp
  check tiền/quyền cần phản hồi ngay.
- **Event sourcing toàn hệ thống** — ledger cần append-only nhưng phần lớn domain không cần replay;
  áp dụng toàn cục làm tăng schema/upcaster/projection/operation cost.
- **Pure Clean Architecture với domain model tách TypeORM ở mọi module** — mapping và boilerplate
  vượt lợi ích cho CRUD đơn giản; chỉ tách khi invariant hoặc nhiều adapter chứng minh nhu cầu.
- **Tách mọi module thành Nx library** — làm project graph và config phình ra nhưng không tạo
  consumer/build/release boundary thật.
- **Big-bang di chuyển toàn bộ file legacy** — xung đột cao, rollback khó và không tăng correctness
  tương xứng so với ratchet + refactor theo lát.

## Hệ quả

- Boundary production, cycle, controller→repository, layer direction, root layout và platform
  compatibility có gate deterministic; lỗi kiến trúc fail sớm ở test/lint.
- Synchronous modular monolith giữ transaction/debug/deploy đơn giản, đổi lại việc tách service
  sau này vẫn cần network contract, data migration và operational readiness; interface hiện tại
  chỉ giảm coupling, không làm extraction “miễn phí”.
- Event durable chấp nhận duplicate và eventual consistency; consumer phải idempotent, metric/trace
  cần correlation và không được hứa exactly-once/global ordering.
- TypeORM entity legacy và một số DTO→service coupling còn là compatibility debt. Chúng không được
  xem là mẫu cho flow phức tạp mới và được dọn khi module có change budget/test phù hợp.
- Chỉ các integration fixture legacy được liệt kê exact trong architecture test mới có thể import
  internal entity để dựng Postgres thật; exception là ratchet và không mở public API production.
  Integration/unit/production file mới đều bị guard chặt.
- Outbox Economy hiện thiếu envelope metadata đầy đủ (`occurredAt`, correlation/causation). Nâng
  contract phải version + migrate consumer, không thay payload ngầm trong refactor kiến trúc này.
- Repository chưa có generic Inbox consumer. Đây là capability phải được thêm cùng durable
  consumer đầu tiên, không phải evidence rằng inbox đã được triển khai sẵn.
