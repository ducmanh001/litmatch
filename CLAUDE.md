<!-- File này Claude Code tự đọc ở đầu MỌI session làm việc trong repo, bất kể đang ở thư mục con nào. Giữ file này ngắn và ổn định — chi tiết đầy đủ nằm ở docs/, file này chỉ trỏ tới và nêu các luật không được vi phạm. Xem docs/00-overview-and-index.md để biết toàn cảnh bộ docs. -->

# Litmatch-style System — Hướng dẫn cho Claude Code

Hệ thống social-entertainment kiểu Litmatch: voice/text matching ẩn danh làm lõi, xoay quanh 1 hệ kinh tế diamond (Economy) để monetize. Mục tiêu là quy mô Litmatch thật (hàng trăm nghìn – hàng triệu người dùng đồng thời), **không phải MVP**. Xem @README.md để biết tổng quan repo.

## 3 luật không được vi phạm (dừng lại và hỏi lại nếu code đang đi ngược 1 trong 3 điều này)

1. **Chỉ 3 thành phần deploy riêng biệt**: `apps/core-api`, `apps/signaling-gateway`, `apps/media-server`. Mọi domain khác (auth, user, matching, economy, social, content, moderation, notification, gift, party-room, feed, avatar...) là **module NestJS bên trong `apps/core-api`**, KHÔNG phải app/service riêng. Không tự ý tạo app thứ 4. Chi tiết + lý do: `docs/03-architecture.md`.
2. **Economy/diamond**: `LedgerEntry` (double-entry, append-only, idempotency key unique ở tầng DB) là nguồn sự thật duy nhất. `Wallet.balance` chỉ là snapshot dẫn xuất, không bao giờ được coi là nguồn sự thật. Không update/xoá dòng ledger cũ — sửa sai bằng bút toán đảo (reversal entry) mới. Chi tiết: `docs/03-architecture.md § 3.8.C`, `docs/02-domain-model.md`.
3. **Trước khi báo 1 task/module là "xong"**: tự chấm lại theo `docs/10-code-review-checklist.md`, bắt đầu từ § 10.0 (liệt kê luồng nghiệp vụ + giả định đang đặt ra về hành vi user, rồi xác nhận từng giả định có bị phá vỡ được không). Đây là bước bắt buộc, không phải tuỳ chọn — đặc biệt cho mọi thứ động tới Economy/Matching/Calling/Gift/Party Room.

## Bản đồ docs (đọc file tương ứng trước khi động vào phần đó, đừng đoán từ trí nhớ)

| Khi cần... | Đọc file |
|---|---|
| Toàn cảnh / mục lục đầy đủ | `docs/00-overview-and-index.md` |
| Danh sách tính năng | `docs/01-product-features.md` |
| Entity/domain model | `docs/02-domain-model.md` |
| Quyết định kiến trúc, service boundary, scale (SFU/matching-shard/ledger) | `docs/03-architecture.md` |
| Chọn công nghệ | `docs/04-tech-stack.md` |
| Coding convention, cấu trúc thư mục | `docs/05-coding-standards.md` |
| Domain rule cụ thể (free-call time, VIP, trust score...) | `docs/06-domain-rules.md` |
| Đang ở giai đoạn nào, làm gì tiếp | `docs/07-roadmap.md` |
| Quy trình giao việc/review theo giai đoạn | `docs/08-working-with-claude-code.md` |
| Lỗi hay gặp cần tránh khi triển khai | `docs/09-practical-notes.md` |
| **Tự review trước khi báo "xong"** | `docs/10-code-review-checklist.md` |

## Quy trình làm việc mặc định

- Làm **đúng 1 giai đoạn** trong `docs/07-roadmap.md` mỗi lần, tick `[x]` khi xong, dừng lại để review trước khi sang giai đoạn tiếp theo — không tự ý nhảy cóc.
- Viết test song song với feature, không dồn cuối.
- Mọi API động tới diamond: idempotency key bắt buộc + transaction DB (`SELECT ... FOR UPDATE` hoặc optimistic lock). Không hardcode giá/threshold — đưa vào `.env` + `ConfigModule`.
- Nếu 1 quyết định cần thiết chưa có trong `docs/`, đề xuất phương án + lý do, hỏi lại thay vì tự ý quyết rồi im lặng — đặc biệt với bất cứ điều gì ảnh hưởng tới 3 luật ở trên.
- Khi phát hiện `docs/` sai hoặc thiếu 1 domain rule quan trọng trong lúc code thật: sửa trực tiếp vào file `docs/` tương ứng (không chỉ sửa trong hội thoại rồi để trôi mất), rồi tiếp tục.

## Lệnh build/test (cập nhật khi Giai đoạn 0 xong)

> Chưa có — repo mới chỉ có docs + khung thư mục, chưa scaffold code. Khi hoàn thành Giai đoạn 0 (`docs/07-roadmap.md`), cập nhật đúng lệnh thật vào đây (vd `pnpm install`, `pnpm test`, `pnpm --filter core-api start:dev`...) để các session sau không phải đoán lại.

## Giới hạn của file này

File này là ngữ cảnh Claude đọc và cố gắng tuân theo, không phải cấu hình chặn cứng — nếu 1 hành vi bắt buộc phải chặn tuyệt đối (không chỉ "cố gắng tuân theo"), cần thêm hook riêng (xem tài liệu Claude Code về hooks), không chỉ dựa vào file này.
