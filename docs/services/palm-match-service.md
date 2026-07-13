# Palm Match Service (module `palm-match` trong `core-api`) — bói toán giải trí, template + random

> Phạm vi: mục "Palm Match: template content, random theo input" — Giai đoạn 5
> ([07-roadmap.md](../07-roadmap.md)). `PalmReadingTemplate` (docs/02): nội dung bói toán dạng
> template, chọn random theo input. Độ phức tạp **Thấp** theo chính đặc tả (docs/01 #5: "chỉ là
> random/template content, không cần AI thật"). **Ngoài phạm vi**: sinh nội dung bằng AI/LLM thật,
> admin CRUD catalog qua UI (chưa có role admin — Task 0 frontend backend, seed qua migration ở
> bản này), quy đổi kết quả ra phần thưởng/diamond (tính năng giải trí thuần, không chạm Economy).

## 1. Vì sao "random theo input" = deterministic theo seed, không phải random thật

Random thật (không seed) khiến cùng 1 user hỏi lại trong cùng ngày với cùng input ra 2 kết quả
khác nhau — cảm giác giả tạo của tính năng kiểu horoscope (docs/10 § Palm Match). Chọn thiết kế:
seed = hash `(userId, category, ngày theo giờ server UTC)` → cùng ngày, cùng category luôn ra cùng
1 template (và cùng cách chọn biến thể nội dung nếu template có nhiều placeholder ngẫu nhiên); qua
ngày khác server tự đổi seed → đổi kết quả. Seed **tính hoàn toàn ở server** từ dữ liệu server đã
có (JWT `userId` + giờ server), client không gửi/chọn được seed — chặn việc "quay số" tới khi ra
kết quả đẹp bằng cách tự đổi seed.

## 2. Mô hình dữ liệu

`palm_reading_templates`: `category` (enum `love|career|health|general`), `content` (text, có thể
chứa placeholder đơn giản `{name}` thay bằng `targetName` nếu user truyền vào), `isActive`
(boolean, cho phép tắt 1 template lỗi nội dung mà không xoá — xoá mất dấu vết nếu cần audit nội
dung từng hiển thị). Seed data: migration mới insert tối thiểu vài chục dòng/category (nội dung
tiếng Việt, tông giọng giải trí nhẹ nhàng — không đưa nội dung nhạy cảm/y tế thật, tránh hiểu lầm
là tư vấn y khoa thật cho category `health`).

Không có bảng lưu "lịch sử đã xem" — kết quả deterministic theo ngày nên không cần lưu; muốn xem
lại kết quả hôm nay chỉ cần gọi lại API cùng input.

## 3. Chọn template — thuật toán

1. Query tất cả `palm_reading_templates` `isActive = true` theo đúng `category` (không tải toàn
   bảng).
2. Không có dòng nào → lỗi domain rõ ràng `PALM_MATCH_CATEGORY_EMPTY` (409), không để 500/mảng
   rỗng gây lỗi runtime khi chọn phần tử.
3. `seed = fnv1aHash("${userId}:${category}:${todayUtcDateString}")`; chọn
   `templates[seed % templates.length]`.
4. Thay `{name}` trong `content` bằng `targetName` (input optional, tối đa
   `PALM_MATCH_TARGET_NAME_MAX_LENGTH`) nếu placeholder tồn tại và input có truyền; không truyền →
   giữ nguyên câu trung tính (template phải tự nhiên cả khi không có `{name}`, không để literal
   `{name}` lộ ra nếu thiếu input — kiểm tra ở test).

## 4. API (`api/v1/palm-match`)

| Endpoint                                        | Mô tả                                                                                                                                                                            |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /palm-match/reading?category=&targetName=` | Trả `{category, content, forDate}` — deterministic theo user + category + ngày server, không cần Idempotency-Key (idempotent tự nhiên do cùng input luôn cùng output trong ngày) |

Guest được dùng tính năng này (không chạm Economy, không phải tính năng bị giới hạn theo
docs/06) — không cần guard đăng ký thật.

## 5. Config (Joi + `.env.example`)

`PALM_MATCH_TARGET_NAME_MAX_LENGTH` (mặc định 50).
