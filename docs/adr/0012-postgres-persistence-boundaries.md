# 0012. Persistence boundaries cho PostgreSQL và TypeORM

- **Ngày**: 2026-08-07
- **Trạng thái**: Accepted
- **Liên quan**: `docs/03-architecture.md § 3.10`, `docs/16-module-blueprint.md § 16.3`,
  `docs/services/economy-service.md § 3`, `docs/services/matching-service.md § 2`

## Bối cảnh

PostgreSQL là nguồn sự thật cho durable state của `core-api`. TypeORM hiện là công cụ mapping và
migration, nhưng một số query không phải CRUD: ledger cần idempotency + lock ví + outbox trong một
transaction; matcher cần khóa hai ticket theo thứ tự và xác minh lại state; Auth cần rotate/reuse
refresh token atomically. Bọc các query này bằng generic repository sẽ che mất protocol correctness.

## Phân loại invariant

### Bắt buộc chặn ở PostgreSQL

- Primary key, foreign key và `NOT NULL` cho ownership/cross-row references.
- Unique identity/idempotency: Auth `(provider, provider_uid)` và `refresh_tokens.token_hash`;
  Economy `transactions.idempotency_key`, account identity, receipt provider transaction;
  Matching ticket idempotency, partial unique một active ticket/user và pending invite/cặp.
- `CHECK` cho miền giá trị và số dương: ledger direction/amount/currency-related values, wallet
  earnings, matching type/status/preference, session distinct users.
- Append-only ledger: trigger chặn `UPDATE`/`DELETE` trên `ledger_entries`.
- Index phục vụ các access path đã chốt: refresh family/user, ledger account/transaction,
  matching shard/status/expiry, outbox unpublished. Index là một phần của query contract, không chỉ
  là tối ưu tùy ý.

Các constraint/schema trên chỉ được thêm hoặc đổi bằng migration mới. Runtime và CLI đều giữ
`synchronize: false`.

### Chặn ở application transaction, không thể thay bằng CHECK đơn giản

- Tổng Nợ = tổng Có theo từng currency, snapshot Wallet khớp ledger và snapshot giá: Ledger writer
  kiểm tra/ghi trong cùng transaction; reconciliation và `rebuildWallet` là safety net.
- Đủ diamond tại thời điểm trừ: `SELECT ... FOR UPDATE` trên wallet, khóa theo thứ tự userId,
  rồi mới check + ghi ledger + cập nhật snapshot.
- Rotate refresh token và revoke family khi reuse: transaction + pessimistic lock/conditional update.
- Matching `queued → confirmed` và tạo session: Redis `ZPOPMIN` atomic trước, sau đó Postgres
  khóa hai ticket, đọc user/safety state tươi, transition và tạo session cùng transaction.
- State transition hợp lệ, phase theo server time, guest quota và retry semantics: domain owner
  enforce tại decision point; unique/check/index của DB là chốt cuối, không thay thế service rule.

Không đặt `CHECK wallets.balance >= 0`: refund/chargeback hợp lệ có thể làm user nợ diamond.

## Quyết định

1. `RefreshSessionPort` là boundary thay implementation cho Auth token lifecycle. `TokenService`
   không biết TypeORM; `TypeOrmRefreshSessionAdapter` giữ transaction/lock/reuse protocol. Auth
   identity upgrade truyền `EntityManager` qua method đã đặt tên khi cần revoke session cũ trong
   cùng transaction; đây là coupling có chủ đích để giữ atomicity cross-aggregate.
2. Economy facade, refund và payOS chỉ phụ thuộc `LedgerPersistencePort`. `LedgerService` là
   implementation hiện tại và vẫn là writer duy nhất; raw SQL, `FOR UPDATE`, unique-violation
   replay, append-only/outbox atomicity không bị tách thành các CRUD method rời rạc.
3. Matching transaction protocol và phần identity write của Auth tiếp tục nằm trong owner
   implementation nơi cần `EntityManager`/locking. Chưa tạo generic `Repository<T>` hoặc đổi PostgreSQL: một
   adapter chỉ đáng tách khi contract thay implementation rõ ràng mà không làm mất atomicity.
4. Cross-module side effect trong Economy nhận transaction handle chỉ qua `withinTransaction` đã
   đặt tên và được test; đây là escape hatch atomicity có chủ đích, không phải public repository.

## Phương án đã loại & lý do

- Generic `DatabaseRepository`/`UnitOfWork` — làm mất ngữ nghĩa lock, thứ tự khóa và rollback khi
  unique/idempotency race; chỉ đổi tên coupling chứ không tạo boundary đúng.
- Tách Matching thành database service hoặc đổi engine — không có bằng chứng vận hành/ADR cần
  deployable mới; vi phạm MonolithFirst.
- Đưa mọi invariant vào PostgreSQL trigger — trigger cross-row cho state machine/transaction
  khiến write path khó kiểm thử và không thay được safety/config checks; giữ phần phù hợp ở owner
  transaction với invariant cấu trúc ở DB.

## Hệ quả và điều kiện xem xét lại

- TypeORM vẫn xuất hiện trong entities, migration, ledger writer, matching worker/service và các
  job cần transaction. Đây là coupling được ghi nhận và có owner, không phải debt cần xóa máy móc.
- Khi cần database khác, thay adapter sau `RefreshSessionPort`/`LedgerPersistencePort` và chạy
  lại integration/race tests; Matching cần một contract transaction-specific trước khi thay.
- Nếu contention ledger/matching vượt khả năng Postgres, cần số liệu benchmark, migration/rollback
  plan và ADR mới trước khi đổi storage hoặc tạo deployable.
