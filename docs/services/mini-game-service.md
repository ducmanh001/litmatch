# Mini Game Service (module `mini-game` trong `core-api`) — oẳn tù tì 2 người trong lúc chat

> Phạm vi: mục "Mini game" — Giai đoạn 5 ([07-roadmap.md](../07-roadmap.md)), **ưu tiên thấp nhất
> toàn dự án**, chỉ bắt đầu sau khi Movie Match + Palm Match đã xong. Đặc tả gốc (docs/01 #11) liệt
> kê "đua xe, giải đố" như ví dụ minh hoạ cho khái niệm "chơi game nhỏ trong lúc chat để tăng
> tương tác", không phải yêu cầu triển khai đủ 2 game đó. **Quyết định phạm vi (chủ động, vì đây là
> mục thấp ưu tiên nhất, tránh đầu tư quá tay cho tính năng phụ — docs/11)**: triển khai đúng 1 game
> đại diện, đơn giản nhất để chứng minh pattern 2-người-đối-kháng-đồng-thời — **oẳn tù tì
> (rock-paper-scissors)**. Đua xe (cần state liên tục theo thời gian thực) và giải đố (cần sinh nội
> dung câu đố) là mở rộng sau nếu có nhu cầu thật, dùng lại đúng khung `MiniGameSession` này (thêm
> `gameType`), không phải viết lại từ đầu.

## 1. Vì sao tái dùng khung Friend, không tạo quan hệ mới

Giống Movie Match: chỉ 2 user đã là bạn (`Friendship`) mới tạo được `MiniGameSession` — không dựng
thêm khái niệm "mời chơi game" riêng. Kết quả ván chơi có thể nhắc tới trong `Conversation` sẵn có
(client tự thông báo qua chat nếu muốn, module này không tích hợp message tự động).

## 2. Mô hình dữ liệu

`mini_game_sessions`: `userLowId`/`userHighId` (canonical), `gameType` (enum, hiện tại chỉ
`rock_paper_scissors` — cột enum thay vì bảng riêng vì chỉ 1 giá trị, mở rộng thêm giá trị enum khi
có game thứ 2, không đổi cấu trúc bảng), `lowMove`/`highMove` (nullable enum
`rock|paper|scissors` — đặt tên theo participant thay vì "player1/player2" để khỏi mơ hồ ai là ai),
`status` (`waiting_moves|resolved|cancelled`), `winnerUserId` (nullable, null nếu hoà),
`resolvedAt`.

Bất biến ở DB: partial unique index `uq_minigame_session_active_user` trên `userLowId` **và**
`userHighId` khi `status = waiting_moves` — 1 user chỉ có 1 ván đang chờ move tại 1 thời điểm (cùng
tinh thần các module trước). Tạo ván mới khi cặp đang có ván `waiting_moves` → trả lại ván hiện có
(idempotent), không tạo ván song song gây nhầm lẫn ván nào đang chờ move.

## 3. Nộp move — không lộ, không đổi được, chống race

`POST /mini-game/sessions/:id/moves` (`move: rock|paper|scissors`):

1. Xác định caller là `userLowId` hay `userHighId` của session → cột tương ứng (`lowMove`/
   `highMove`).
2. `UPDATE mini_game_sessions SET <cột>Move = $move WHERE id = $id AND <cột>Move IS NULL AND status
= 'waiting_moves'` — **update có điều kiện làm chốt chặn**, không phải check-rồi-ghi (docs/10 §
   10.1.C): request thứ 2 của cùng user (double-submit/race) thấy 0 row ảnh hưởng → trả lỗi
   `MINI_GAME_MOVE_ALREADY_SUBMITTED` (409), **không đổi được move đã nộp**.
3. Sau update, đọc lại session trong cùng transaction: nếu cả 2 cột move đã có giá trị → tính
   thắng/thua (`rock > scissors > paper > rock`, giống nhau → hoà), set `status = resolved`,
   `winnerUserId`, `resolvedAt = now()`, publish `minigame.session.resolved` **kèm cả 2 move** cho
   cả 2 participant. Chỉ 1 trong 2 cột có giá trị → **không trả/không publish move đó cho ai** —
   API response cho người vừa nộp chỉ xác nhận "đã nộp", không lộ trạng thái đối phương.
4. `GET /mini-game/sessions/:id`: trước khi resolved chỉ trả `{status, myMove, opponentHasMoved:
boolean}` — không bao giờ trả `opponentMove` trước khi `resolved` (kể cả cho chính người đã nộp
   trước).

## 4. Lifecycle & lỗi

`POST /mini-game/sessions` (`friendUserId`, `gameType='rock_paper_scissors'`) — verify bạn bè qua
`FriendService` (404 cùng mã cho "không tồn tại"/"không phải bạn", cùng pattern Movie Match/Friend
Chat). `POST /mini-game/sessions/:id/cancel` — 1 trong 2 bên huỷ ván đang chờ move (`cancelled`,
giải phóng unique slot). IDOR: mọi endpoint theo `id` chỉ chấp nhận participant, cùng 404
`MINI_GAME_SESSION_NOT_FOUND` cho không tồn tại/không phải thành viên. Ván đã `resolved`/
`cancelled` → 409 khi thao tác nộp move.

## 5. Realtime (tái dùng hạ tầng — [realtime-gateway.md](./realtime-gateway.md))

Event mới: `minigame.session.started` (khi tạo), `minigame.session.resolved` (kèm `lowMove`,
`highMove`, `winnerUserId` — publish SAU khi cả 2 đã nộp, không có event trung gian báo "1 bên đã
nộp" để tránh channel side khác suy luận ai nộp trước). Best-effort, `GET
/mini-game/sessions/:id` là fallback polling.

## 6. Config

Không cần config mới — game không có timer/giới hạn thời gian nộp move ở bản này (mở rộng sau nếu
cần "hết hạn ván chờ quá lâu", theo dõi qua `createdAt` khi có nhu cầu thật).
