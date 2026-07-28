# PostHog Cloud — user analytics miễn phí

## Phần code đã làm sẵn

`apps/web` có page view, Core Web Vitals lấy mẫu 10%, identify theo UUID + loại tài khoản,
session replay và reset identity khi logout. Khi có đủ token + host, SDK tự opt-in,
`autocapture` bật, page view theo history change và page-leave tắt; trang **Quyền riêng tư** chỉ
hiển thị trạng thái bật, không có thao tác opt-in riêng. Replay hiện **không mask input/text**.
Thiếu env thì SDK không khởi tạo và web vẫn chạy.

Đây là behavior code-backed hiện tại, không phải khuyến nghị privacy mặc định. Trước khi cấu hình
PostHog cho môi trường có người dùng thật, chủ hệ thống phải xác nhận policy/consent và dữ liệu
được phép thu. Nếu yêu cầu opt-in hoặc masking, integration hiện tại chưa đáp ứng; giữ env trống
cho tới khi code, test, runbook và registry được đổi cùng nhau.

## Phần chủ hệ thống cần làm một lần

1. Tạo tài khoản tại <https://app.posthog.com> và chọn project Cloud EU nếu ưu tiên dữ liệu ở EU.
2. Trong Project settings, copy `Project token` và `Host`.
3. Thêm vào env build/deploy của web:

   ```dotenv
   NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_xxx
   NEXT_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com
   ```

4. Build/deploy lại web, mở **Quyền riêng tư → Cải thiện trải nghiệm** và xác nhận trạng thái
   analytics đang bật; màn hình hiện tại không cho user tự tắt.
5. Trong PostHog kiểm tra `Activity`, `People`, `Web analytics` và `Session replay`.
6. Giữ Free plan (không cần thẻ). Free plan cap usage; nếu sau này chuyển pay-as-you-go thì đặt
   billing limit bằng `0` hoặc mức tối đa chấp nhận được trước khi nhập thẻ.

Code identify chủ động chỉ gửi UUID + loại tài khoản; không chủ động gửi email, phone, birth date,
token hoặc OTP. Tuy nhiên autocapture và replay không mask có thể thu text/field hiển thị, cùng
browser/device, vị trí suy ra, URL và referrer của SDK. Không ghi câu “không gửi nội dung nhạy
cảm” nếu chưa có masking/filter và kiểm chứng tương ứng.
