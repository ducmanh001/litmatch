# Media Service (module trong `core-api`)

## 1. Ảnh upload trực tiếp lên cloud

Các luồng Post, Friend Chat và Story không nhận URL ảnh tùy ý từ browser:

1. Gọi `POST /api/v1/media/images/upload-intent` với `purpose`, `contentType` và `sizeBytes`.
2. PUT file trực tiếp vào `uploadUrl` presigned, kèm đúng `Content-Type`.
3. Gửi `assetId` vào endpoint nghiệp vụ tương ứng.

Core API không nhận body binary. Khi gắn asset vào nội dung, `MediaService` kiểm tra asset thuộc
caller, đúng status đã upload và object tồn tại trên storage; chỉ sau đó mới trả public URL để
persist vào model nội dung hiện tại. Core API đọc metadata + magic bytes, rồi promote object sang
key final bất biến; URL final không trỏ tới object quarantine. URL là read model/compatibility
field, không phải input tin cậy từ client.

## 2. Storage provider

- Local/test dùng `MEDIA_STORAGE_PROVIDER=dev`, không upload binary thật.
- Hosted/production dùng `MEDIA_STORAGE_PROVIDER=r2` với Cloudflare R2 S3-compatible và public
  base URL của bucket. Credential chỉ nằm ở core-api.
- Browser upload dùng presigned PUT; bucket phải cấu hình CORS cho các origin web hợp lệ và public
  read qua custom domain hoặc public URL phù hợp môi trường. Copy
  `deploy/hosted/r2-cors.json`, thay `app.example.com`/`admin.example.com` bằng domain thật, rồi
  chạy `wrangler r2 bucket cors set <bucket-name> --file deploy/hosted/r2-cors.json`.
- Môi trường dev mặc định không lưu binary; muốn test upload thật phải đặt `MEDIA_STORAGE_PROVIDER=r2`
  và điền credential R2 vào `.env`.

## 3. Guard

- Chỉ `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Mặc định tối đa 10 MB/ảnh; backend là nguồn sự thật.
- Asset có owner và status trong `image_assets`; user khác không thể dùng asset.
- Object upload trước hết nằm ở key quarantine; MIME khai báo phải khớp magic bytes, size phải
  khớp object metadata, rồi mới được promote sang key final.
- Không thêm URL ảnh tùy ý vào DTO HTTP của Post, Friend Chat hoặc Story.
