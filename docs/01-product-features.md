[← 00 · Overview](./00-overview-and-index.md) · **01 · Product capabilities** · [02 · Domain model →](./02-domain-model.md)

# 1. Bản đồ capability sản phẩm

File này giữ **ý định và ranh giới sản phẩm**, không giữ trạng thái triển khai. Muốn biết checkout
hiện tại có source/test evidence nào, đọc [`feature-registry.json`](./feature-registry.json) hoặc
[report được sinh](./generated/product-spec-evidence-report.md) sau khi chạy `pnpm docs:check`.
Provider có code nhưng thiếu credential/sandbox vẫn có thể chưa sẵn sàng ở runtime.

Các số 1–16 được giữ để không làm gãy tham chiếu lịch sử; capability bổ sung được nối tiếp.

|   # | Capability                             | Ý định và boundary sản phẩm                                                                                                                                                                                         |
| --: | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | **Soul Match**                         | Ghép hai người vào chat text ẩn danh có thời hạn; rating `rude / boring / like`; chỉ mutual-like mới mở danh tính và tạo quan hệ bền vững.                                                                          |
|   2 | **Voice Match**                        | Ghép gọi thoại 1-1 qua SFU, tối đa 7 phút cho mọi tier; mutual-like mở Friendship + voice call bền vững, không mutual thì kết thúc quan hệ ẩn danh.                                                                 |
|   3 | **Party Room**                         | Voice room nhiều người với role host/speaker/audience, cap cứng theo config và quà realtime.                                                                                                                        |
|   4 | **Movie Match / Movie Night**          | Hai mode: bạn bè chủ động xem URL đã chọn, hoặc queue ẩn danh với video server chọn, chat/rating và mutual reveal; không tự xử lý/transcode video.                                                                  |
|   5 | **Palm Match**                         | Queue ẩn danh, flip card theo lượt, compatibility snapshot và like/skip; kết quả được seed/chốt ở server, không quảng bá như chẩn đoán, bói toán thật hoặc AI prediction.                                           |
|   6 | **Feed và Stories**                    | Post/ảnh, reaction, comment, audience per-post và story hết hạn; quyền xem/block được enforce ở server.                                                                                                             |
|   7 | **Avatar tùy chỉnh**                   | Avatar nhiều layer và item catalog, cho phép giữ ẩn danh; item trả phí đi qua Economy.                                                                                                                              |
|   8 | **Diamond, top-up và VIP**             | Một nền kinh tế xuyên sản phẩm: payOS web, IAP native, VIP và mọi debit qua ledger double-entry; runtime readiness phụ thuộc provider/credential.                                                                   |
|   9 | **Matching speed-up**                  | Dùng Diamond để tăng priority ticket không giới hạn số lượt; giá theo tier do server trả, client không hard-code.                                                                                                   |
|  10 | **Gift**                               | Tặng quà trong context được phép; người gửi mất DIA, người nhận nhận PTS theo tỉ lệ config, không chuyển Diamond 1:1.                                                                                               |
|  11 | **Mini game**                          | Hoạt động nhẹ trong social context; implementation đầu tiên là rock-paper-scissors, không phải một game platform độc lập.                                                                                           |
|  12 | **Trust & Safety**                     | Report, block, moderation và trust signals cắt các điểm chạm liên quan; audit nhạy cảm phải bền vững.                                                                                                               |
|  13 | **Preference khi matching**            | Tuổi/giới tính/region là tiêu chí lọc có consent; state machine và `canPair` ở server mới là authority.                                                                                                             |
|  14 | **Availability theo platform/runtime** | UI lấy trạng thái provider từ runtime capability contract. Policy store, credential và release profile phải được kiểm lại trước mỗi launch; không hard-code một danh sách availability vĩnh viễn trong client/docs. |
|  15 | **Friend và chat 1-1**                 | Mutual-like tạo Friendship + Conversation atomically; tin nhắn bền vững khác chat ẩn danh tạm thời.                                                                                                                 |
|  16 | **Đăng ký, onboarding và guest**       | Phone OTP/social/guest; guest nâng cấp bằng cách gắn identity vào **cùng userId/wallet**. Guest match có quota chống farm; entry point nâng cấp trên UI là delivery concern riêng.                                  |
|  17 | **Discovery, Nearby và direct invite** | Browse profile, nearby opt-in bảo vệ vị trí và mời Soul/Voice Match có consent; không biến thành friend-request flow thứ hai.                                                                                       |
|  18 | **Mood và conversation streak**        | Mood preset công khai có privacy rule; streak chỉ tăng khi hai chiều trò chuyện theo ngày UTC.                                                                                                                      |
|  19 | **Short video**                        | Upload lifecycle, feed/ranking, reaction/comment/report và admin moderation; storage/transcode production đi qua provider port, không dùng LiveKit SFU.                                                             |
|  20 | **Notification**                       | In-app notification là baseline; push chỉ sẵn sàng khi provider production được cấu hình và runtime contract xác nhận.                                                                                              |
|  21 | **Support và admin operations**        | Support ticket, user/moderation/economy/catalog/config/permission dashboards; mọi quyền thật được enforce ở backend, UI guard chỉ hỗ trợ UX.                                                                        |

## 1.1 Product boundaries không được suy diễn

- Frontend trình bày và orchestration UX; business rules, quyền, giá, quota và state machine thuộc
  backend owner.
- “Có source” không đồng nghĩa “đã launch”. Native IAP, push, video provider, multi-region và
  capacity production cần bằng chứng môi trường thật.
- Tính năng mới bắt đầu là module trong `core-api`; không tạo deployable mới chỉ vì bảng trên có
  một capability riêng.
- Capability bị cắt/hoãn phải có trigger mở lại ở [07 · Roadmap](./07-roadmap.md) hoặc service
  spec, không để mockup/plan cũ tự trở thành requirement.

Litmatch ở đây là một social-entertainment platform lấy matching và interaction làm lõi, còn
Economy là boundary rủi ro cao xuyên nhiều capability. Vì vậy correctness của ledger, identity,
consent và trust/safety được ưu tiên hơn số lượng màn hình.

---

[← 00 · Overview](./00-overview-and-index.md) · [02 · Domain model →](./02-domain-model.md)
