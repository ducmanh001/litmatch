# Litmatch Agent Contract

Nguồn hướng dẫn bắt buộc cho mọi agent. Chi tiết theo nhu cầu nằm ở
`pnpm agent:context <scope>` và `docs/08-working-with-agents.md`.

## 3 invariant

1. **Ba backend deployable:** chỉ `apps/core-api`, `apps/signaling-gateway`,
   `apps/media-server`. Domain mới là module NestJS trong `core-api`. App thứ tư cần ADR mới và
   đạt tiêu chí `docs/03 § 3.4`. Frontend không chứa business logic.
2. **Economy:** `LedgerEntry` double-entry, append-only là nguồn sự thật; `Wallet.balance` chỉ là
   snapshot. `Transaction.idempotencyKey` phải unique ở DB. Sửa sai bằng reversal entry, không
   sửa/xoá ledger cũ.
3. **Quality gate:** thay đổi business nhạy cảm phải chạy `review-module verify` và PASS, kèm bảng
   giả định, vị trí chặn (`file:line`) và test thật. Docs/tooling không chạm business flow ghi
   `review-module: N/A` có lý do và vẫn phải chạy check theo scope.

## Quy trình

1. Chốt ngắn objective, out-of-scope, acceptance criteria, scope, risk/invariant và checks.
2. Chạy `pnpm agent:context <scope>`; đọc mục **Read first**, chỉ đọc mục **Read when applicable**
   khi điều kiện khớp. Đọc thêm `AGENTS.md` gần file đang sửa nếu có.
3. Task không tầm thường dùng `adaptive-orchestration`; module mới dùng `new-module`; business
   flow mới dùng `review-module plan`.
4. Sửa lát nhỏ, viết test cùng thay đổi; schema chỉ đổi bằng migration mới.
5. Chạy test file/target bị ảnh hưởng và check được context yêu cầu. Chỉ chạy full suite khi user
   yêu cầu hoặc quality gate của scope bắt buộc.
6. Sửa docs canonical nếu phát hiện sai/thiếu; bàn giao outcome, file, checks, assumptions và risk.

## Thứ tự nguồn

`AGENTS.md` root → architecture/ADR → coding standards → `AGENTS.md` gần nhất. File gần chỉ được
thêm boundary chặt hơn, không được nới invariant. Roadmap mô tả tiến độ, không phải luật kỹ thuật.
Nếu nguồn mâu thuẫn, dừng và sửa nguồn canonical trong cùng thay đổi.

## Budget thực thi

- Dùng `rg` có glob; đọc tối đa 200 dòng/lần. Không nạp file trên 100 KB, lockfile, bundle hoặc
  build artifact. Log mặc định tối đa 20 dòng liên quan.
- CLI có thể treo phải bọc `timeout 45s`. Không polling/sleep loop, process dài foreground hoặc
  progress filler. Cùng một failure chỉ sửa và retry tối đa hai lần.
- Tối đa hai sub-agent cho workstream độc lập; chỉ truyền contract rút gọn + file path, không
  truyền chat history/raw log. Dừng delegate khi đủ evidence; tranh luận tối đa một round.

## Lệnh chính

```bash
pnpm agent:context <scope>
pnpm agent:check
pnpm agent:verify <scope>
```
