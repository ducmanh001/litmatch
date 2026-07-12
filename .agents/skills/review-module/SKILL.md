---
name: review-module
description: Plan hoặc verify một module bằng cách đối chiếu hai chiều giữa business flow, assumptions, docs, code và test. Dùng trước khi code luồng nghiệp vụ mới và bắt buộc trước khi hoàn tất thay đổi Economy, Matching, Calling, Gift, Party Room, Feed hoặc Trust and Safety.
---

# Review module

Mode là `plan` hoặc `verify`; mặc định `verify`.

## 1. Nạp context

1. Đọc `AGENTS.md`, file `AGENTS.md` theo scope và `docs/10-code-review-checklist.md`.
2. Chạy `pnpm agent:context <scope>`.
3. Đọc service spec và domain rules áp dụng.
4. Nếu domain chưa có checklist đặc thù, bổ sung vào docs trước khi review tiếp.

## 2. Lập flow và assumptions trước khi đọc code chi tiết

1. Vẽ chuỗi bước đầy đủ của mỗi business flow.
2. Liệt kê assumption về thứ tự API, retry, concurrency, state và dữ liệu client.
3. Với từng assumption, ghi ai có thể phá và bằng cách nào.
4. Mode `plan`: chỉ rõ tầng/chỗ dự kiến chặn.

## 3. Verify vào code

Chỉ áp dụng cho mode `verify`:

1. Tìm chỗ chặn thật cho từng assumption và ghi `file:line`; không tìm thấy là ❌.
2. Đối chiếu checklist chung và domain-specific; N/A phải có lý do.
3. Luồng tiền phải xác nhận: unique idempotency ở DB, check + action atomic, ledger append-only.
4. Chạy test thật. Economy bắt buộc dùng Postgres và `--skip-nx-cache`.

## 4. Output cố định

```markdown
## Review — <scope> — <plan|verify> — <YYYY-MM-DD>

### 1. Phạm vi & luồng nghiệp vụ

<A → B → C>

### 2. Bảng giả định

| #   | Giả định | Ai phá / cách phá | Chặn ở đâu | Verdict |
| --- | -------- | ----------------- | ---------- | ------- |

### 3. Checklist áp dụng

| Mục | Kết quả | Ghi chú |
| --- | ------- | ------- |

### 4. Test đã chạy

<lệnh + kết quả thật>

### 5. Kết luận: PASS / FAIL

<việc phải sửa hoặc xác nhận hoàn tất>
```

Verdict: ✅ chặn đúng · ❌ không chặn · ⚠️ cần quyết định/chặn một phần.

Mode `verify` FAIL thì task chưa xong. Assumption ⚠️ ảnh hưởng nghiệp vụ phải xin quyết định,
không tự chốt. Docs sai/thiếu phải sửa nguồn docs trong cùng thay đổi.
