---
name: review-module
description: Plan/verify module qua business flow, assumptions, code và test. Bắt buộc trước khi hoàn tất Economy, Matching, Calling, Gift, Party Room, Feed hoặc Trust & Safety.
---

# Review module

Mode: `plan | verify`; mặc định `verify`.

## 1. Context

1. Chạy `pnpm agent:context <scope>`; đọc root + scope `AGENTS.md` và domain spec áp dụng.
2. Trong `docs/10-code-review-checklist.md`, luôn đọc § 10.0; dùng `rg -n '^\*\*'` để tìm và chỉ
   đọc checklist chung/domain liên quan. Không nạp cả file nếu task chỉ chạm một domain.
3. Domain chưa có checklist riêng thì bổ sung nguồn canonical trước khi review tiếp.

## 2. Flow và assumptions

1. Vẽ đủ chuỗi bước `A → B → C`.
2. Liệt kê assumption về thứ tự API, retry, concurrency, state và dữ liệu client.
3. Với mỗi assumption, ghi ai/cái gì có thể phá và hậu quả.
4. Mode `plan`: chỉ rõ tầng/vị trí dự kiến chặn.

## 3. Verify

Chỉ áp dụng cho mode `verify`:

1. Map từng assumption vào `file:line`; không tìm thấy chốt chặn là ❌.
2. Đối chiếu checklist chung + đúng domain; `N/A` phải có lý do.
3. Economy phải xác nhận unique idempotency ở DB, check + action atomic và ledger append-only.
4. Chạy test thật. Economy bắt buộc Postgres và `--skip-nx-cache`; chỉ giữ tối đa 20 dòng log
   liên quan trong output.

## 4. Output

```markdown
## Review — <scope> — <plan|verify> — <YYYY-MM-DD>

### 1. Luồng nghiệp vụ

<A → B → C>

### 2. Bảng giả định

| #   | Giả định | Vector phá/hậu quả | Vị trí chặn (file:line) | Verdict |
| --- | -------- | ------------------ | ----------------------- | ------- |

### 3. Checklist

| Mục | Kết quả | Ghi chú |
| --- | ------- | ------- |

### 4. Test evidence

<lệnh + kết quả thật, tóm tắt>

### 5. Kết luận: PASS / FAIL

<việc còn phải sửa hoặc xác nhận hoàn tất>
```

Verdict: ✅ chặn đúng · ❌ không chặn · ⚠️ cần quyết định/chặn một phần.

Mode `verify` FAIL nghĩa là task chưa xong. Assumption ⚠️ ảnh hưởng nghiệp vụ cần user quyết định;
docs sai/thiếu phải sửa nguồn canonical trong cùng thay đổi.
