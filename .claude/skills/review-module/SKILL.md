---
name: review-module
description: Tự review 1 module theo docs/10-code-review-checklist.md với output template cố định, thống nhất giữa mọi session. Dùng ở 2 thời điểm - "plan" TRƯỚC khi viết code (liệt kê luồng nghiệp vụ + giả định), "verify" SAU khi code xong và TRƯỚC khi báo "xong". Bắt buộc cho mọi thay đổi động tới Economy/Matching/Calling/Gift/Party Room/Feed/Trust-and-Safety.
argument-hint: '[plan|verify] <tên module hoặc mô tả phạm vi>'
---

# /review-module — review theo phương pháp luận § 10.0 với output thống nhất

Skill này script hoá `docs/10-code-review-checklist.md` để mọi lần review — bất kể session nào, model nào — đều chạy đúng quy trình và xuất đúng 1 format. Mode lấy từ tham số đầu tiên: `plan` hoặc `verify` (mặc định `verify` nếu không ghi).

## Quy trình bắt buộc (không bỏ bước, không đổi thứ tự)

### Bước 1 — Nạp đúng context, không dựa vào trí nhớ

1. Đọc `docs/10-code-review-checklist.md` § 10.0 (toàn bộ) + § 10.2 đúng mục domain đang review (Economy/Matching/Calling/Party Room/Feed/Gift/Avatar/Trust & Safety...).
2. Đọc spec service tương ứng nếu có (`docs/services/*.md`) và mục domain rule liên quan trong `docs/06-domain-rules.md`.
3. Nếu domain chưa có mục trong § 10.2: đây là tín hiệu phải VIẾT THÊM mục mới vào docs/10 theo tư duy § 10.0 (câu cuối docs/10 § 10.2 quy định điều này) — làm trước khi review tiếp.

### Bước 2 — Liệt kê luồng + giả định, TRƯỚC khi đọc code chi tiết

Đây là bước hay bị bỏ qua nhất và là lý do skill này tồn tại. Chưa được mở file code chi tiết ở bước này (đọc route/tên endpoint để vẽ luồng thì được).

1. Vẽ chuỗi bước đầy đủ của luồng nghiệp vụ (vd `vào queue → được ghép → confirm → call start → tick trừ tiền → settle`).
2. Với mỗi bước, liệt kê **giả định** hệ thống đang đặt về hành vi user/client/hệ thống (thứ tự gọi API, dữ liệu client gửi lên, trạng thái không đổi giữa chừng, hành động không lặp lại...).
3. Với mỗi giả định, ghi rõ: **ai có thể phá và phá bằng cách nào** (client tự viết gọi thẳng API, 2 request song song, retry do timeout, đổi trạng thái giữa chừng luồng...).

### Bước 3 — (chỉ mode `verify`) Đối chiếu từng giả định vào code

1. Với từng giả định ở Bước 2: tìm đúng chỗ chặn trong code, ghi `file:line`. Không tìm thấy chỗ chặn = ❌, không được ghi "chắc là có".
2. Tick các mục § 10.1 áp dụng + toàn bộ mục § 10.2 của domain. Mục nào không áp dụng ghi "N/A + lý do 1 dòng".
3. Với code động tới tiền: kiểm tra thêm 3 điều bắt buộc — idempotency key là unique constraint DB trên `Transaction`; check + hành động atomic trong 1 transaction (`SELECT ... FOR UPDATE`); không update/xoá `LedgerEntry` (chỉ bút toán đảo).

### Bước 4 — (chỉ mode `verify`) Chạy test, dán bằng chứng thật

1. `pnpm nx test core-api` (hoặc project tương ứng).
2. Nếu động tới Economy/tiền: BẮT BUỘC chạy thêm integration test trên Postgres thật:
   `INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test pnpm nx test core-api --skip-nx-cache`
   (phải `--skip-nx-cache` — cache Nx có thể trả kết quả cũ không kèm integration).
3. Dán lệnh + kết quả tóm tắt thật vào output. Không được ghi "tests pass" mà không chạy.

### Bước 5 — Xuất output đúng template dưới đây, rồi kết luận

## Template output (cố định — giữ nguyên cấu trúc/heading, chỉ điền nội dung)

```markdown
## Review — <module/phạm vi> — <plan|verify> — <YYYY-MM-DD>

### 1. Phạm vi & luồng nghiệp vụ

<liệt kê chuỗi bước, mỗi luồng 1 dòng dạng A → B → C>

### 2. Bảng giả định (§ 10.0)

| #   | Giả định | Ai phá / phá bằng cách nào | Chặn ở đâu (file:line) | Verdict |
| --- | -------- | -------------------------- | ---------------------- | ------- |

<!-- Verdict: ✅ chặn đúng · ❌ không chặn · ⚠️ chặn một phần hoặc cần user quyết định.
     Mode plan: cột "Chặn ở đâu" ghi "sẽ chặn tại <tầng/chỗ dự kiến>" -->

### 3. Checklist § 10.1 / § 10.2 (chỉ liệt kê mục áp dụng)

| Mục | Kết quả | Ghi chú |
| --- | ------- | ------- |

### 4. Test đã chạy (mode verify)

<lệnh + kết quả tóm tắt thật; economy bắt buộc có dòng integration test>

### 5. Kết luận: PASS / FAIL

<FAIL: liệt kê từng việc phải sửa, đánh số. PASS: 1 dòng xác nhận mọi giả định đã chặn + test xanh>
```

## Luật kết thúc

- Mode `verify` ra **FAIL** → KHÔNG được báo task "xong". Sửa hết danh sách ở mục 5, chạy lại `/review-module verify` từ Bước 3, cho tới PASS.
- Có giả định ⚠️ cần quyết định nghiệp vụ → hỏi user, không tự quyết rồi im lặng (đúng quy trình CLAUDE.md).
- Output của mode `verify` (PASS) chính là nội dung dán vào mục "Bảng giả định & chỗ chặn" của PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
- Phát hiện docs sai/thiếu trong lúc review → sửa thẳng file `docs/` tương ứng ngay, không để trôi (quy ước docs/00).
