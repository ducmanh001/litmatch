# PostHog Cloud — user analytics miễn phí

## Phần code đã làm sẵn

`apps/web` có page view, Core Web Vitals lấy mẫu 10%, identify theo UUID + loại tài khoản,
session replay và reset identity khi logout. Autocapture/page-leave tắt để giảm event và chi
phí. Analytics là optional: thiếu env thì SDK không khởi tạo và web vẫn chạy. Replay mask toàn
bộ input/text. Không hiện banner hoặc chặn hành trình; user chủ động bật/tắt tại trang
**Quyền riêng tư**.

## Phần chủ hệ thống cần làm một lần

1. Tạo tài khoản tại <https://app.posthog.com> và chọn project Cloud EU nếu ưu tiên dữ liệu ở EU.
2. Trong Project settings, copy `Project token` và `Host`.
3. Thêm vào env build/deploy của web:

   ```dotenv
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_xxx
   NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   ```

4. Build/deploy lại web, mở **Quyền riêng tư → Cải thiện trải nghiệm** và bật analytics.
5. Trong PostHog kiểm tra `Activity`, `People`, `Web analytics` và `Session replay`.
6. Giữ Free plan (không cần thẻ). Free plan cap usage; nếu sau này chuyển pay-as-you-go thì đặt
   billing limit bằng `0` hoặc mức tối đa chấp nhận được trước khi nhập thẻ.

Không gửi email, phone, birth date, token, OTP hoặc nội dung chat lên PostHog. Browser/device,
vị trí suy ra, URL và referrer do SDK PostHog thu theo consent.
