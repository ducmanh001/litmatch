# Visual references

HTML trong `layouts/web/` và `layouts/admins/` là reference cho typography, color, spacing và
interaction direction. Chúng **không** là product/API/domain contract và có thể mô tả field/action
chưa tồn tại.

Khi implement:

1. Giữ visual language tương thích khi không làm sai behavior.
2. Đối chiếu OpenAPI, runtime capability, service spec và route source.
3. Nếu mockup cần backend contract mới, đưa vào roadmap/product decision; không fake bằng local
   state như thể action đã hoạt động.
4. Label prototype/demo rõ nếu user yêu cầu giữ màn hình chưa có backend.

Frontend architecture/standards tại `docs/12-frontend-architecture.md` và
`docs/13-frontend-coding-standards.md` có thẩm quyền cao hơn reference này.
