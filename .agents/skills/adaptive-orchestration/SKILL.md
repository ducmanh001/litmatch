---
name: adaptive-orchestration
description: Tự đánh giá độ phức tạp, rủi ro và khả năng tách độc lập của một yêu cầu để chọn mức model, reasoning effort, loại prompt và số sub-agent có chi phí thấp nhất nhưng vẫn giữ quality gate. Dùng cho task code, review, điều tra hoặc thiết kế không tầm thường khi người dùng muốn agent tự điều phối, tự chọn model, giảm token, chạy song song hoặc đạt chất lượng gần model mạnh mà không dùng model mạnh cho toàn bộ công việc.
---

# Adaptive orchestration

Giữ agent gốc làm owner của objective, authority, synthesis và kết luận cuối. Chỉ delegate phần
việc có contract độc lập và chỉ nâng model khi bằng chứng cho thấy tier thấp hơn không đủ.

## 1. Lập task contract

Ghi ngắn gọn objective, out-of-scope, acceptance criteria, rủi ro và checks bắt buộc. Không đưa
toàn bộ lịch sử hội thoại hoặc prompt người dùng cho sub-agent; truyền context tối thiểu cần thiết.

Không delegate quyết định cần authority mới, thao tác phá huỷ, hoặc câu hỏi mà agent gốc phải hỏi
người dùng. Không dùng orchestration để lách guard, review hay test của repo.

## 2. Phân loại bằng router

Chuẩn hoá task thành JSON, không chứa prompt, secret hay dữ liệu người dùng:

```json
{
  "action": "change",
  "workstreams": 2,
  "risk": "medium",
  "uncertainty": "medium",
  "context": "medium",
  "changeSize": "medium",
  "verification": "standard"
}
```

Giá trị hợp lệ:

- `action`: `answer | inspect | change | review | incident`
- `workstreams`: `1..4`, chỉ đếm phần việc thật sự độc lập
- `risk`: `low | medium | high | critical`
- `uncertainty`: `low | medium | high`
- `context`: `small | medium | large`
- `changeSize`: `none | small | medium | large`
- `verification`: `light | standard | strict`

Chạy:

```bash
node .agents/skills/adaptive-orchestration/scripts/route-task.mjs '<json>'
```

Nếu không chạy được script, áp dụng cùng policy: simple/standard làm trực tiếp; complex dùng tối
đa hai delegate; critical dùng một worker cost-balanced và một reviewer mạnh.

## 3. Ánh xạ tier vào runtime

Chọn model cụ thể từ danh sách runtime đang expose; không đoán model ID.

- `economy`: model rẻ nhất đủ cho tìm kiếm hẹp, đọc code và thu thập bằng chứng ít rủi ro.
- `balanced`: model general-purpose tốt nhất theo tỉ lệ chất lượng/chi phí cho implement và review.
- `frontier`: model mạnh nhất; chỉ dùng cho reviewer/specialist khi critical, conflict hoặc thất bại.
- `current`: giữ model hiện tại của agent gốc.

Chọn reasoning effort đúng output router. Nếu runtime không hỗ trợ tier hoặc override, bỏ override
và dùng model kế thừa; không block task. Agent gốc không giả vờ đã tự đổi model của chính lượt
đang chạy: model selection chỉ áp dụng được khi runtime tạo delegate mới.

## 4. Delegate có giới hạn

Không spawn cho task simple/standard, thay đổi nhỏ một file, hoặc chuỗi bước phụ thuộc tuần tự.
Với `parallel-delegates`, chỉ chạy song song khi các workstream không ghi cùng file hoặc cùng
external state. Giao ownership file/responsibility rõ ràng và nhắc worker rằng họ không làm việc
một mình, không revert thay đổi của người khác.

Dùng đúng prompt type và chỉ truyền artifact cần thiết:

```text
explorer: Trả lời đúng một câu hỏi read-only. Nêu file:line hoặc bằng chứng; không sửa file.
worker: Objective + ownership + constraints + acceptance + checks. Sửa trong ownership, không mở rộng scope.
reviewer: Kiểm tra raw diff/artifact theo invariants và tìm counterexample. Không được biết đáp án kỳ vọng.
```

Cap là hai sub-agent. Với critical, dành một slot cho independent reviewer. Dừng hoặc interrupt
delegate ngay khi đã đủ bằng chứng; không spawn nhiều agent để bỏ phiếu. Khi kết quả conflict,
agent gốc kiểm tra evidence rồi mới dùng reviewer frontier.

## 5. Giữ quality floor

Agent gốc phải đọc kết quả, kiểm tra diff thực tế, tích hợp thay đổi và chạy checks áp dụng. Với
risk high/critical hoặc `verification=strict`, bắt buộc có independent review theo route. Model
mạnh không thay thế test; model rẻ không được tự kết luận task hoàn tất.

Nếu delegate thất bại vì thiếu context, bổ sung đúng phần thiếu một lần. Nếu thất bại vì reasoning
hoặc kết quả mâu thuẫn, nâng một tier cho đúng workstream; không rerun toàn bộ task bằng model mạnh.

## 6. Chặn chảy máu token

- Không chạy polling loop, `sleep` hoặc lặp status. Sau khi trigger job/push thì dừng; nếu người dùng
  yêu cầu chờ, dùng tối đa một native blocking wait/watch rồi bàn giao.
- Không gửi progress filler. Chỉ báo kết quả có ý nghĩa, blocker cần quyết định hoặc update mà
  runtime bắt buộc.
- Dùng `rg`, bounded `sed` và filter loại `node_modules`, `dist`, `.next`, `build`, `coverage`,
  `.git`. Không đọc lockfile, bundle/minified file, build artifact hoặc file dài toàn bộ khi chỉ cần
  một đoạn.
- Giới hạn log đưa vào context ở 20 dòng liên quan; tăng có chủ đích khi 20 dòng chưa chứa lỗi gốc.
- Với cùng một failure, sửa và retry tối đa hai lần. Lần thứ hai vẫn lỗi thì dừng, tóm tắt evidence
  và xin hướng dẫn; không thử lần ba theo phỏng đoán.
- Chỉ chạy unit test file/target bị ảnh hưởng. Full test suite chỉ chạy khi người dùng yêu cầu rõ;
  vẫn giữ các gate đặc thù bắt buộc của repo cho domain nhạy cảm.
- Batch các lệnh ngắn có quan hệ bằng `&&`. Không chạy dev server hoặc process dài ở foreground.
- Không truyền raw log hoặc lịch sử hội thoại giữa agent; truyền path, line, contract và summary
  một lần. Không gọi lại tool cùng input sau khi đã có kết quả hợp lệ.

## 7. Ví dụ prompt người dùng

```text
Dùng $adaptive-orchestration xử lý yêu cầu sau: <yêu cầu>. Tự đánh giá complexity, chọn model và
sub-agent phù hợp; ưu tiên giảm token nhưng giữ nguyên acceptance criteria và quality gates của repo.
```
