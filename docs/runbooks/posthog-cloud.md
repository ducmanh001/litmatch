# PostHog Cloud — user analytics miễn phí

## Phần code đã làm sẵn

`apps/web` có page view, Core Web Vitals lấy mẫu 10%, identify theo UUID + loại tài khoản và reset
identity khi logout. Khi có đủ token + host, SDK chỉ khởi tạo sau cookie consent hợp lệ;
`autocapture` và Session Replay tắt, page view theo history change và page-leave tắt. Trang
**Quyền riêng tư** hiển thị công tắc consent thật, không auto-opt-in. Thiếu env thì SDK không khởi
tạo và web vẫn chạy.

Đây là behavior code-backed hiện tại. Trước khi cấu hình PostHog cho môi trường có người dùng thật,
chủ hệ thống vẫn phải xác nhận policy/consent và dữ liệu được phép thu. Nếu yêu cầu thay đổi phạm vi
event, phải đổi code, test, runbook và registry cùng nhau.

## Phần chủ hệ thống cần làm một lần

1. Tạo tài khoản tại <https://app.posthog.com> và chọn project Cloud EU nếu ưu tiên dữ liệu ở EU.
2. Trong Project settings, copy `Project token` và `Host`.
3. Thêm vào env build/deploy của web:

   ```dotenv
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_xxx
   NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   ```

4. Build/deploy lại web, mở **Quyền riêng tư → Cải thiện trải nghiệm** và xác nhận trạng thái
   analytics chỉ bật sau khi user đã consent; màn hình cho user tự bật/tắt rõ ràng.
5. Trong PostHog kiểm tra `Activity`, `People` và `Web analytics`. Session Replay chủ động tắt để
   tránh upload nội dung màn hình, CPU/RAM trình duyệt và chi phí ingest.
6. Giữ Free plan (không cần thẻ). Free plan cap usage; nếu sau này chuyển pay-as-you-go thì đặt
   billing limit bằng `0` hoặc mức tối đa chấp nhận được trước khi nhập thẻ.

Code identify chủ động chỉ gửi UUID + loại tài khoản; không chủ động gửi email, phone, birth date,
token hoặc OTP. Autocapture và Replay đều tắt; SDK vẫn có thể gửi browser/device, URL, referrer
cùng page view và event kỹ thuật được code gọi rõ ràng. Không ghi câu “không gửi nội dung nhạy
cảm” nếu chưa có filter và kiểm chứng tương ứng.
