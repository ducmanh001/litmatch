# Dựng lại site 10M (code-10m + architecture-10m)

Thư mục này nằm trong clone `litmatch-push` (nhánh `feat/realtime-scale-10m`, đầu `0c052aa`, không được commit/push từ đây).

1. **Overlay code local** (chỉ khi có thay đổi chưa commit ở cây chính): `bash layouts/feature-flows/overlay-local-changes.sh apply`
   chép các file `apps/`, `libs/` đang sửa/chưa theo dõi của `C:/Users/phan.van.manhb/workspace/litmatch` đè lên clone này
   (ghi danh sách vào `.overlay-manifest.txt`); `... revert` hoàn tác. Sau khi code local đã được commit/đẩy thì không cần overlay.
2. **Trang code**: `LITMATCH_BASELINE_DIR=<code-10m đã xuất bản> node layouts/feature-flows/engine-10m.mjs` rồi
   `node layouts/feature-flows/verify-10m.mjs` (phải in `OK: không có vấn đề.`). Engine tự gắn nhãn "đã đẩy / local" theo
   file nguồn dirty (`git status`) và so với bản đã xuất bản (nếu code hiển thị giống hệt thì vẫn là "đã đẩy").
3. **Trang kiến trúc**: `node layouts/feature-flows/arch-10m.mjs` (đọc `arch-10m-data.mjs` cho sơ đồ, `arch-10m-pages.mjs` cho chữ,
   nhãn nguồn lấy từ `code-10m/*/*.sources.json`; PNG qua Edge/Playwright; `--no-png` để bỏ).
4. **Staging + kiểm link**: `PAGES_WORK=<thư mục> node layouts/feature-flows/stage-site.mjs` (cần `<thư mục>/pages` là clone repo
   `ducmanh001/litmatch-feature-flows`); thêm khối liên kết ở trang gốc, sitemap, llms.txt, README; kiểm mọi link tương đối.
5. **Xuất bản**: chép `stage/{code-10m,architecture-10m,index.html,sitemap.xml,llms.txt,README.md}` vào `pages/`, `git add`, commit với
   danh tính `ducmanh001 <115025970+ducmanh001@users.noreply.github.com>` (KHÔNG dùng email công ty ở cấu hình toàn cục, KHÔNG thêm
   trailer Co-Authored-By), rồi đẩy bằng HTTPS vì SSH không có khoá ở máy này:
   `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push https://github.com/ducmanh001/litmatch-feature-flows.git main`.
   Kiểm `gh api repos/ducmanh001/litmatch-feature-flows/pages/builds/latest` tới khi `status = built`.

Sửa sơ đồ: chỉnh toạ độ trong `arch-10m-data.mjs` (lưới 10 px; cạnh vuông góc, `via` để ép đường đi), rồi chạy lại bước 3.
Thêm trang code: tạo `annotated-<NN>-<slug>.mjs` (xem các file mẫu), gắn `arch: '<slug trang kiến trúc>'`, chạy bước 2.
