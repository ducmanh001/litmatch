# 0007. Refresh token chuyển sang httpOnly cookie + CSRF double-submit

- **Ngày**: 2026-07-14
- **Trạng thái**: Accepted
- **Thay thế**: ADR 0003 (đóng gate được nêu ở đó)
- **Liên quan**: docs/12-frontend-architecture.md § 12.6, docs/13 § 13.11, ADR 0002

## Bối cảnh

ADR 0003 yêu cầu chốt một trong hai hướng trước khi cho phép public: httpOnly cookie (ưu tiên)
hoặc nonce CSP sau benchmark tải/chi phí. Sản phẩm chưa go-live (chưa có user thật), Admin
feature set đã xong (PR #21-#24) — đây là thời điểm hợp lý để đóng gate này trước khi có traffic
thật, tránh phải làm migration token cho user thật sau này.

So sánh 2 hướng:

- **httpOnly cookie**: loại hẳn refresh token khỏi mọi JS-accessible storage (localStorage
  lẫn `document.cookie`), XSS không còn cách đọc được token dù có chạy được script. Cần thêm
  CSRF defense vì cookie tự động gắn theo request. Không ảnh hưởng SSR/static rendering vì các
  route xác thực (`(app)`) đã là dynamic theo thiết kế hiện tại (docs/12 § 12.5) — không có gì
  để mất về CDN cache ở nhóm route này.
- **nonce CSP**: giảm (không loại hẳn) rủi ro XSS đọc token qua inline script; buộc toàn bộ
  route dùng nonce phải dynamic render — tốn thêm compute server-side, cần benchmark tải/chi
  phí trước khi chốt (chính ADR 0003 đã ghi rõ điều này).

httpOnly cookie là lựa chọn an toàn hơn về bản chất (loại bỏ vector, không phải giảm thiểu) và
không có chi phí hạ tầng — chọn hướng này, đúng ưu tiên ADR 0003 đã ghi.

## Quyết định

1. **Refresh token chuyển hẳn sang httpOnly cookie**, `Secure` (bật ở `NODE_ENV=production`),
   `SameSite=Strict`, `Path=/api/v1/auth`. Profile frontend/backend khác site được dùng
   `AUTH_COOKIE_SAME_SITE=none` theo ADR 0009; `None` vẫn luôn đi cùng `Secure`, exact CORS
   allowlist và CSRF ở điểm 3-4. `AuthTokensDto` không còn trả `refreshToken` trong body — client
   không bao giờ thấy giá trị này.
2. **Access token giữ nguyên**: vẫn ký JWT, trả trong body, FE giữ trong memory — không đổi
   (ADR này chỉ đóng gate refresh token, không mở lại quyết định access token).
3. **CSRF double-submit, giá trị phát qua response body (không qua `document.cookie`)**: `web`
   và `admin` chạy khác origin với `core-api` (port/subdomain khác nhau) — cookie do server set
   thuộc origin của server, JS chạy trên origin khác **không đọc được** dù cookie không
   httpOnly (giới hạn của cùng-origin, không phải của `httpOnly`). Double-submit đúng cho kiến
   trúc SPA-khác-origin là: server set cookie `csrf_token` (để `httpOnly` luôn, vì FE không cần
   đọc qua `document.cookie`) VÀ trả CÙNG giá trị đó trong JSON body lúc login/refresh (field
   `csrfToken`). FE echo lại giá trị đã nhận qua header `X-CSRF-Token` khi gọi
   `/auth/refresh`, `/auth/logout`. Server so khớp cookie (browser tự gắn kèm) vs header (client
   tự gửi từ giá trị nhận qua body) — lệch hoặc thiếu thì 401; do same-origin-policy chặn kẻ tấn
   công đọc response body của request họ không tự thực hiện được, cặp giá trị khớp chỉ có thể
   có ở client đã đăng nhập hợp lệ. Chỉ 2 route này cần CSRF (route nghiệp vụ khác vẫn xác thực
   bằng `Authorization: Bearer` — cookie không tự gắn kèm header tuỳ biến, CSRF không áp dụng
   được).
   - **`csrfToken` PHẢI persist ở `localStorage` phía FE** (khác `refreshToken` — không bao giờ
     persist): access token chỉ ở memory nên mỗi lần reload trang, JS mất hết state, phải gọi
     lại `/auth/refresh` để phục hồi phiên — nhưng cookie httpOnly vẫn còn (sống sót qua reload,
     đó là cookie thật), nếu không có sẵn `csrfToken` để gửi lại thì lần gọi refresh đầu tiên
     sau reload LUÔN bị CsrfGuard chặn dù cookie hợp lệ, hỏng hẳn khả năng giữ đăng nhập qua
     reload. Persist `csrfToken` (KHÔNG phải `refreshToken`) an toàn vì giá trị này vô dụng với
     kẻ tấn công nếu thiếu cookie httpOnly đi kèm — CSRF thuần (không XSS) không đọc được
     localStorage của origin khác (cùng ranh giới same-origin bảo vệ y hệt in-memory state); còn
     XSS thật trên chính origin thì đã "toang" ở mọi thiết kế lưu trữ, không riêng gì
     `localStorage` (đã là premise của toàn bộ threat model httpOnly — xem `Hệ quả`).
4. **CORS**: `credentials: true`, giữ nguyên allow-list `CORS_ORIGINS` đã validate ở Task 0 —
   không mở `*` khi có credentials (browser tự chặn kết hợp này, nhưng vẫn giữ invariant rõ
   trong code).
5. **Cutover sạch, không giữ hybrid**: vì chưa có user thật, không cần dual-mode hay migration
   dữ liệu — refresh token cũ (nếu còn) đơn giản không hoạt động được nữa (client không còn gửi
   theo cách cũ), user chỉ cần đăng nhập lại.

## Phương án đã loại & lý do

- **nonce CSP** — cùng mức ưu tiên thấp hơn theo ADR 0003 (giảm thiểu, không loại bỏ vector) và
  cần benchmark tải/chi phí trước; httpOnly cookie không cần benchmark vì không đổi rendering
  mode.
- **Giữ hybrid (cookie song song localStorage) cho giai đoạn chuyển tiếp** — không cần thiết vì
  chưa có user thật; giữ 2 cơ chế cùng lúc tăng bề mặt lỗi mà không có lợi ích thật (không ai
  đang dùng session cũ cần bảo toàn).
- **Đưa CSRF token vào JWT claim thay vì cookie riêng** — double-submit cookie là pattern chuẩn,
  đơn giản hơn (không cần verify chữ ký CSRF token, chỉ so khớp giá trị), đủ cho threat model ở
  đây (không cần tính năng revoke CSRF token riêng biệt).

## Hệ quả

- `apps/web` và `apps/admin`: `RefreshTokenStorage`/`browserRefreshTokenStorage` đổi đối tượng
  lưu trữ từ `refreshToken` sang `csrfToken` (interface/cơ chế storage-event giữ nguyên, chỉ đổi
  giá trị nhạy cảm bên trong — xem điểm 3). `status` ban đầu suy ra từ việc CÓ hay KHÔNG
  `csrfToken` đã persist: có → `restorable` (thử refresh 1 lần lúc load), không có → thẳng
  `unauthenticated` (chưa từng đăng nhập, khỏi tốn round-trip).
- Cross-tab sync giữ nguyên cơ chế `storage` event (không cần BroadcastChannel mới): tab khác
  rotate `csrfToken` → tab này cập nhật giá trị, KHÔNG đổi trạng thái đăng nhập; tab khác logout
  (giá trị bị xoá) → tab này chuyển `unauthenticated` ngay, không cần đợi tự 401.
- CSRF chỉ áp cho 2 route (`refresh`, `logout`) — review sau này thêm route mới đọc cookie theo
  cách tương tự thì PHẢI áp lại double-submit, không giả định an toàn theo mặc định.
- Threat model còn lại: mất máy/token bị đánh cắp ở tầng network (giảm bởi `Secure` — chỉ gửi
  qua HTTPS) và session cố định qua thời gian sống refresh token (đã có rotation + reuse
  detection từ trước, không đổi). Không migration/rollback dữ liệu cần làm do chưa có user thật;
  rollback chỉ là revert PR + redeploy.
- Xem xét ADR mới nếu sau này cần hỗ trợ non-browser client (mobile app) dùng chung
  `core-api` — cookie không áp dụng được cho mobile, cần quay lại Bearer refresh token qua kênh
  khác (secure storage OS), không sửa ADR này.
- **Bằng chứng browser E2E** (điều kiện đóng gate ADR 0003): `apps/web/e2e/
login-and-join-matching-queue.spec.ts` (Playwright, Chrome thật) — đăng nhập OTP, reload
  trang thật (xoá sạch state JS), xác nhận session tự phục hồi qua cookie httpOnly +
  CSRF header đúng, rồi vào được luồng nghiệp vụ (hàng đợi ghép đôi). Chạy qua `pnpm nx e2e web`.
  Quá trình build spec này cũng phát hiện và sửa 1 lỗi thật: `createApiClient` thiếu
  `credentials: 'include'` mặc định nên browser âm thầm bỏ `Set-Cookie` của mọi response
  cross-origin ngoài `/auth/refresh` (login/verify) — xem `libs/api-client/src/lib/client.ts`.
