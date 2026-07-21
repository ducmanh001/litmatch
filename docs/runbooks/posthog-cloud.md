# PostHog Cloud — user analytics miễn phí

## Phần code đã làm sẵn

`apps/web` đã có autocapture, page view, identify theo UUID + nickname, session replay và reset
identity khi logout. Analytics là optional: thiếu env thì SDK không khởi tạo và web vẫn chạy.
Replay mask toàn bộ input và toàn bộ text; user phải đồng ý qua banner trước khi capture.

## Phần chủ hệ thống cần làm một lần

1. Tạo tài khoản tại <https://app.posthog.com> và chọn project Cloud EU nếu ưu tiên dữ liệu ở EU.
2. Trong Project settings, copy `Project token` và `Host`.
3. Thêm vào env build/deploy của web:

   ```dotenv
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_xxx
   NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   ```

4. Build/deploy lại web, mở site và chọn **Đồng ý** trên banner.
5. Trong PostHog kiểm tra `Activity`, `People`, `Web analytics` và `Session replay`.
6. Giữ Free plan (không cần thẻ). Free plan cap usage; nếu sau này chuyển pay-as-you-go thì đặt
   billing limit bằng `0` hoặc mức tối đa chấp nhận được trước khi nhập thẻ.

Không gửi email, phone, birth date, token, OTP hoặc nội dung chat lên PostHog. Browser/device,
vị trí suy ra, URL và referrer do SDK PostHog thu theo consent.
