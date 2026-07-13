<!-- Template này khớp với output của skill review-module (.agents/skills/review-module/)
     và docs/10-code-review-checklist.md § 10.0.E — reviewer đọc BẢNG GIẢ ĐỊNH trước, diff sau. -->

## Mô tả

<!-- Làm gì, thuộc giai đoạn/slice nào trong docs/07-roadmap.md -->

## Luồng nghiệp vụ chạm tới

<!-- Chuỗi bước đầy đủ, vd: vào queue → được ghép → confirm → call start → tick trừ tiền → settle -->

## Bảng giả định & chỗ chặn (§ 10.0 — bắt buộc nếu chạm Economy/Matching/Calling/Gift/Party Room/Soul/Friend/Feed/Trust & Safety)

<!-- Dán nguyên mục 2 từ output `/review-module verify`. Verdict: ✅ chặn đúng · ❌ không chặn · ⚠️ cần quyết định -->

| #   | Giả định | Ai phá / phá bằng cách nào | Chặn ở đâu (file:line) | Verdict |
| --- | -------- | -------------------------- | ---------------------- | ------- |
|     |          |                            |                        |         |

## Checklist trước khi xin review

- [ ] Đã chạy `/review-module verify` — kết luận **PASS** (dán output vào bảng trên)
- [ ] Test viết song song với feature, không dồn cuối (docs/05 § 5.9)
- [ ] Chạm tiền: integration test trên Postgres thật pass (`INTEGRATION_DB_URL=... pnpm nx test core-api --skip-nx-cache`)
- [ ] Không hardcode giá/threshold — đưa vào `.env` + `ConfigModule`, cập nhật `.env.example`
- [ ] Schema đổi bằng migration MỚI — không sửa/xoá migration đã commit
- [ ] API mới có decorator OpenAPI ngay tại endpoint; lỗi theo taxonomy `*.errors.ts` (docs/05 § 5.4–5.5)
- [ ] Frontend: OpenAPI/generated client không drift, không copy server state và reconnect có resync
- [ ] Phát hiện docs sai/thiếu trong lúc làm → đã sửa thẳng file `docs/` tương ứng
- [ ] Tick `[x]` mục tương ứng trong `docs/07-roadmap.md` (nếu hoàn thành 1 mục roadmap)

## Bằng chứng test

<!-- Lệnh + kết quả tóm tắt thật (số test pass/fail, coverage nếu có) -->

- [ ] `pnpm ci:preflight` pass trước lần push cuối
