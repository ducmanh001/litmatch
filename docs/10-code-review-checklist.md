[← 09 · Practical Notes](./09-practical-notes.md) · **10 · Code Review Checklist** · [sources →](./sources.md)

# 10. Checklist Review Code — lỗi phổ quát + lỗi logic nghiệp vụ + lỗi đặc thù dự án

> Dùng phần này làm checklist khi review PR, hoặc yêu cầu agent **tự chấm lại code theo đúng các mục dưới trước khi coi 1 task là "xong"** — đây là bước bắt buộc, được nhắc lại trong `/AGENTS.md` ở root. Mục 10.1/10.2 nghiêng nhiều về lỗi kỹ thuật (concurrency, security, performance) nhưng còn thiếu 1 lớp lỗi khác — lỗi mà code chạy hoàn toàn "đúng như đã viết", compile sạch, test pass, nhưng **luật nghiệp vụ đằng sau lại sai hoặc thiếu**. Loại lỗi này giới bảo mật gọi là **business logic vulnerability / logic flaw**: **không có scanner hay linter nào bắt được**, vì bản thân syntax và luồng thực thi không sai — chỉ có người hoặc agent hiểu đúng domain mới review ra được. § 10.0 dưới đây là cách tư duy để review ra loại lỗi này; 10.1 và 10.2 bổ sung nhiều mục cụ thể dựa theo cách tư duy đó.

## 10.0 Phương pháp luận review "lỗi logic nghiệp vụ" — làm trước khi đọc code chi tiết

> Đây là phần quan trọng nhất của file này. Lỗi logic nghiệp vụ không nằm trong bug của code — nó nằm trong khoảng trống giữa các bước của 1 luồng nghiệp vụ, nơi hệ thống **tin tưởng ngầm** rằng user sẽ đi đúng theo đường đã vẽ sẵn. Đặt các câu hỏi sau **trước khi** đọc từng dòng code, cho mỗi tính năng có nhiều bước (matching, gọi, tặng quà, mua diamond, VIP, party room...):

**A. Tư duy theo luồng (process), không phải theo từng endpoint riêng lẻ**

- Vẽ lại toàn bộ chuỗi bước của tính năng (vd Voice Match: `vào queue → được ghép → call bắt đầu → tick trừ tiền → call kết thúc → settle cuối`). Với mỗi bước, tự hỏi: "Có thể gọi thẳng bước sau mà bỏ qua bước này không?" — vd gọi thẳng API `call.end-settle` mà chưa từng qua `call.start` hợp lệ.
- Với mọi luồng nhiều bước: đăng nhập lại, gọi thẳng API của bước 3/4/5 bằng ID cũ hoặc ID đoán được, xem hệ thống có tin dữ liệu đó mà không xác minh lại trạng thái không.

**B. Không bao giờ tin dữ liệu/tham số phía client gửi lên để ra quyết định nghiệp vụ**

- Nếu client gửi lên `price`, `duration`, `role`, `isVip`, `matchType`... mà server dùng thẳng để tính tiền/tính quyền — đây là lỗi nghiêm trọng. Server phải tự tra lại từ DB/nguồn tin cậy, không nhận giá trị đó từ request.
- Đặc biệt nguy hiểm với app có tầng UI + tầng API tách biệt (mobile app gọi API riêng): đừng giả định "user chỉ thao tác qua UI nên UI chặn là đủ" — mọi rule phải chặn lại ở server bất kể FE có chặn hay chưa.

**C. Rule chỉ được áp dụng 1 lần lúc đầu, không được xác minh lại xuyên suốt luồng**

- Lỗi phổ biến: check điều kiện (vd đủ tuổi, đủ diamond, chưa bị block) **chỉ ở bước đầu luồng**, rồi tin trạng thái đó không đổi cho tới bước cuối — trong khi thực tế trạng thái (số dư, bị block, bị report, tài khoản bị khoá) có thể đổi **giữa chừng luồng**. Nguyên tắc: **xác minh lại đúng thời điểm hành động xảy ra**, không chỉ lúc bắt đầu.

**D. Tìm chỗ có thể "chồng" hoặc "lặp" hành động để trục lợi**

- Tương tự lỗi "cộng dồn discount" của thương mại điện tử (thêm hàng vào giỏ tới ngưỡng giảm giá rồi bỏ bớt hàng ra nhưng vẫn giữ discount) — app này có các chỗ tương đương cần soi kỹ: có thể **claim phần thưởng (reward) 2 lần** bằng cách gọi API 2 lần gần như đồng thời không? Có thể **giữ trạng thái VIP/ưu đãi cũ** sau khi điều kiện để có nó đã mất không? Có thể **tận dụng độ trễ giữa 2 request** để vượt qua giới hạn (rate limit, số lần free call/ngày) không?
- Việc lạm dụng phong phú tuỳ domain — cần hiểu đúng nghiệp vụ Litmatch để soi hết (matching, gift, VIP...), không có checklist chung nào đủ cho tất cả trường hợp; coi § 10.2 dưới đây là điểm khởi đầu, không phải danh sách đầy đủ.

**E. Quy trình áp dụng cụ thể khi review 1 PR/feature**

1. Trước khi đọc code: liệt kê rõ **các bước** của luồng nghiệp vụ mà PR này chạm vào, và **giả định** mà code đang đặt ra về hành vi user (vd "giả định user luôn gọi API theo đúng thứ tự A → B → C").
2. Với mỗi giả định, tự hỏi: "Nếu user (hoặc 1 client tự viết gọi thẳng API, không qua app thật) phá vỡ giả định này thì điều gì xảy ra?"
3. Chỉ sau đó mới đọc code để xác nhận giả định có thực sự được chặn ở tầng server hay không.
4. Ghi lại các giả định + cách đã chặn thành comment ngắn trong code hoặc trong PR description — để lần review sau (hoặc người khác) không phải suy luận lại từ đầu.

## 10.1 Lỗi thường gặp (áp dụng cho mọi domain business, không riêng dự án này)

**A. Cấu trúc & thiết kế**

- God Service: 1 service/class ôm quá nhiều trách nhiệm (vd `MatchingService` vừa lo queue vừa lo billing vừa lo notification)
- Business logic rò rỉ ra Controller (Controller tự tính toán thay vì chỉ điều phối)
- Business logic rò rỉ vào Repository (Repository chứa if/else nghiệp vụ thay vì chỉ query)
- Duplicate logic giữa nhiều service do không tách shared library
- Lạm dụng `any`/optional để né việc thiết kế type chuẩn

**B. Xử lý lỗi**

- `try/catch` nuốt lỗi (catch rồi không throw lại, không log) → lỗi biến mất âm thầm
- Bắt Exception chung chung (`catch (e) { return null }`) thay vì phân loại lỗi domain cụ thể
- Không phân biệt lỗi client (400) và lỗi hệ thống (500) → trả sai status code
- Không có global exception filter, mỗi endpoint tự xử lý lỗi 1 kiểu khác nhau

**C. Concurrency & Async**

- Thiếu `await` khiến promise chạy "bắn rồi quên" trong luồng cần đảm bảo thứ tự
- Race condition khi nhiều request cùng sửa 1 resource mà không dùng lock/transaction
- Không xử lý `Promise.reject` → unhandled rejection làm crash process
- Dùng `Promise.all` cho các thao tác cần rollback nếu 1 cái fail (thiếu tính atomic)
- **Check-rồi-hành-động (check-then-act) không atomic**: đọc số dư/trạng thái rồi mới quyết định hành động ở 1 câu lệnh riêng, giữa 2 bước đó request khác chen vào — luôn phải gộp check + hành động trong cùng 1 transaction hoặc dùng `SELECT ... FOR UPDATE`/optimistic lock (version column), không tách rời
- Chọn sai giữa 3 chiến lược xử lý resource tranh chấp: **pessimistic lock** (Postgres `FOR UPDATE`, đơn giản, chấp nhận chờ), **optimistic lock** (version column, retry khi conflict, phù hợp khi conflict hiếm), **hàng đợi tuần tự hoá** (Kafka/RabbitMQ, xử lý lần lượt, thêm độ trễ nhưng đảm bảo đúng thứ tự) — dùng sai chiến lược cho đúng bài toán (vd dùng optimistic lock cho chỗ conflict xảy ra thường xuyên) gây retry storm
- Distributed lock (Redis/Zookeeper) thiếu TTL hoặc thiếu cơ chế gia hạn (renew) an toàn → giữ lock mãi khi process crash giữa chừng, hoặc lock hết hạn giữa lúc vẫn đang xử lý (2 vấn đề đối lập, cả hai đều nguy hiểm)

**D. Bảo mật**

- Thiếu validate input ở boundary (tin tưởng dữ liệu client gửi lên)
- **IDOR** (Insecure Direct Object Reference): dùng ID client gửi lên để query thẳng data của user khác mà không check quyền sở hữu — rất dễ gặp trong app có nhiều resource theo userId (profile, wallet, session)
- Secret/API key hardcode trong code hoặc bị log ra ngoài
- Thiếu rate-limit cho endpoint nhạy cảm (login, report, gửi tin nhắn)

**E. Testing**

- Test chỉ cover happy path, không test edge case (số dư = 0, queue rỗng, timeout mạng)
- Test kiểm tra implementation detail (có gọi hàm X không) thay vì kiểm tra behavior/output thật
- Thiếu test cho race condition trong flow tiền bạc — chỗ dễ hư nhất nhưng hay bị bỏ qua nhất

**F. Performance**

- N+1 query (loop gọi DB thay vì join/batch)
- Thiếu index cho cột hay filter/sort (`status`, `createdAt`, `userId`)
- Query không giới hạn (thiếu pagination) cho list có thể phình to (feed, lịch sử giao dịch)

**G. Code hygiene**

- Magic number/string rải rác thay vì đưa vào constant/config
- **Tự viết tay/tự định nghĩa lại 1 giá trị mà framework/thư viện đang dùng đã có sẵn hằng số/enum/type cho đúng việc đó** (vd `@HttpCode(200)` thay vì `HttpStatus.OK` của `@nestjs/common`, tự định nghĩa lại 1 union type trùng enum thư viện đã export, tự parse thứ mà 1 decorator/pipe có sẵn đã làm) — luôn kiểm tra framework/thư viện đã cung cấp sẵn trước khi viết tay hoặc tự định nghĩa hằng số riêng trùng lặp. Ngoại lệ: khi giá trị đó bắt buộc phải cấu hình động qua `.env`/`ConfigService` (§ 5.1) mà API tĩnh của thư viện không hỗ trợ (vd interval của cron đọc từ config → phải dùng `SchedulerRegistry` động thay vì decorator `@Interval()`/`@Cron()` tĩnh) thì không tính là lỗi.
- **Cùng 1 giá trị/helper bị định nghĩa ≥2 nơi trong repo** (`docs/05 § 5.1` — grep trước khi khai mới): mã lỗi Postgres, helper bắt unique-violation, URL bên thứ 3, topic Kafka, JWT payload shape... — 1 định nghĩa duy nhất tại tầng chủ quản (`database/`, `common/`, `<module>.constants.ts`), mọi nơi khác import.
- **Tự chế lại 1 helper mà khung dùng chung đã có** (`docs/05 § 5.3`: cursor pagination, idempotency decorator, postgres-errors, DomainException...) — vd tự encode cursor bằng `Buffer` thay vì `encodeCursor`/`buildCursorPage` của `@litmatch/common-dtos`. 2 chuẩn song song = mỗi bản thiếu 1 case khác nhau.
- **Chuỗi định danh nội bộ (job name, Redis key, Kafka topic, tên constraint, prefix idempotency, Symbol DI token) viết literal tại chỗ dùng** thay vì named constant/builder ở file chủ quản, hoặc khai báo mà không có comment lý do (`docs/05 § 5.1` mục 4).
- **Hợp đồng type giữa producer và consumer bị chẻ đôi** — 2 đầu tự khai shape riêng (vd nơi ký JWT truyền object literal, nơi verify tự khai interface): thêm field là phải sửa 2 chỗ, lệch không báo compile (`docs/05 § 5.3`).
- **Module có cấu trúc thư mục lệch chuẩn `docs/05 § 5.3`** (service phụ nằm ở gốc module thay vì `services/`, thiếu `index.ts`/`*.errors.ts`) — module sau copy theo là lệch lan rộng.
- Comment lỗi thời không khớp code thật, hoặc code bị comment out để "sau này dùng"
- Method quá dài (>50 dòng) hoặc nesting sâu (>3 cấp if/else)

**H. Lỗi logic nghiệp vụ (business logic) — áp dụng phương pháp luận § 10.0**

- Rule chỉ check ở bước đầu luồng, không xác minh lại ở bước cuối (vd check đủ tiền lúc bắt đầu call nhưng không check lại lúc trừ tiền theo phút)
- Tin dữ liệu nhạy cảm (giá, thời lượng, role, quyền) do client gửi lên thay vì server tự tra lại
- Có thể gọi thẳng 1 bước giữa/cuối luồng nhiều bước mà bỏ qua các bước trước (state machine không được validate transition hợp lệ ở server)
- Có thể lặp lại 1 hành động sinh lợi (claim thưởng, nhận quà, mở khoá tính năng) nhiều lần do thiếu kiểm tra "đã thực hiện chưa" gắn với transaction DB
- Giới hạn (rate limit, số lần miễn phí/ngày, cooldown) chỉ enforce ở tầng UI/FE, không enforce lại ở server

## 10.2 Lỗi đặc thù dự án (theo từng domain của hệ thống này)

**Economy/Wallet/Ledger — nơi dễ mất tiền thật nhất, review kỹ nhất**

- Dùng kiểu số thực (float) cho diamond/tiền thay vì integer/decimal chuẩn → sai số làm tròn tích luỹ theo thời gian
- Update balance kiểu `UPDATE wallet SET balance = balance - X` không lock → 2 request đồng thời trừ tiền gây lệch số dư (lost update)
- Thiếu idempotency key cho API trừ/cộng tiền → client retry do timeout mạng làm trừ tiền 2 lần; idempotency key **phải** là unique constraint ở tầng DB, không chỉ check bằng code (check-rồi-insert vẫn có race)
- Không validate receipt IAP với Apple/Google ở server → client có thể giả mạo giao dịch mua diamond
- Cho phép balance âm do thiếu check trước khi trừ
- Transaction/ledger cho phép update/xoá dòng cũ thay vì append-only → mất dấu vết audit khi có tranh chấp
- **Chưa áp dụng double-entry thật** (xem [03-architecture.md § 3.8.C](./03-architecture.md)): chỉ có 1 cột `balance` mà không có bút toán Nợ/Có 2 chiều → không tự phát hiện được khi tổng tiền trong hệ thống bị lệch (tiền "sinh ra từ hư không" do bug), vì không có bất biến toán học nào để kiểm chứng
- Balance hiển thị cho user bị coi là nguồn sự thật thay vì dữ liệu dẫn xuất từ ledger → khi lệch, không có cách nào rebuild lại đúng
- Refund/hoàn tiền viết đè lên giao dịch gốc thay vì tạo **bút toán đảo (reversal entry)** mới trỏ ngược về giao dịch gốc — làm mất lịch sử đầy đủ, khó đối soát khi có khiếu nại
- Đơn vị tiền tệ khác nhau (nếu có mở rộng đa quốc gia sau này) bị cộng/trừ lẫn lộn mà không quy đổi hoặc không tách tài khoản theo currency
- **Discount/ưu đãi VIP tính lại theo trạng thái cũ**: giá gói/diamond hiển thị lúc bắt đầu thanh toán khác với giá thực tính lúc chốt giao dịch (vd VIP hết hạn giữa lúc đang thanh toán) mà server không tính lại giá tại thời điểm chốt — chống bằng snapshot giá vào giao dịch (versioned pricing, [services/economy-service.md § 1.5](./services/economy-service.md))
- **Refund/chargeback từ store bị bỏ quên**: chỉ xử lý credit lúc nạp, không có luồng nhận App Store Server Notifications / Google RTDN → user hoàn tiền sau khi đã tiêu diamond mà hệ thống không đảo bút toán → thất thoát. Refund phải tạo bút toán đảo và cho phép số dư âm (nợ), không "clamp về 0" (phá bất biến double-entry) — xem [services/economy-service.md § 5](./services/economy-service.md)
- **CHECK balance >= 0 ở DB chặn nhầm refund hợp lệ**: đặt constraint số dư không âm trên bảng snapshot làm không ghi được bút toán đảo khi user đã tiêu → chống tiêu quá số dư là guard tầng ứng dụng (`SELECT ... FOR UPDATE` + `balance - amount >= 0`), không phải constraint trên snapshot
- **Giao dịch sửa sai không truy được người thực hiện**: bút toán `reversal`/`adjustment` thủ công không ghi `actor_user_id` + lý do → không audit được khi có tranh chấp tài chính
- **Gift trộn 2 currency trong 1 chân**: cố cân "trừ DIA / cộng PTS" trong cùng 1 cặp Nợ/Có (2 currency khác nhau) thay vì 2 chân độc lập mỗi chân tự cân theo currency → phá bất biến, sinh/mất tiền — xem [services/economy-service.md § 6](./services/economy-service.md)

> **Tiêu chí "xong" bắt buộc cho Economy (không phải tuỳ chọn) — không chỉ dựa vào review đọc mắt:**
>
> - **Property test bất biến double-entry**: sinh ngẫu nhiên chuỗi giao dịch (nạp/mua VIP/gift/refund), sau mỗi bước assert **tổng Nợ = tổng Có theo từng currency** và `rebuildWallet()` khớp snapshot. Đây là cái linter/review không thay được.
> - **Test concurrency thật trên Postgres**: N request song song cùng trừ 1 ví (không lost update), N request song song cùng `idempotency_key` (chỉ 1 giao dịch được tạo), refund song song với tiêu tiền.
> - **Test refund-sau-tiêu**: user nạp → tiêu hết → refund → assert balance âm đúng, tiêu tiếp bị chặn, nạp bù trừ nợ đúng.

**Matching — nơi dễ sai logic ghép cặp**

- Race condition: 2 matching worker cùng lấy 1 user ra khỏi queue và ghép với 2 người khác nhau cùng lúc → user bị match đôi (khắc phục bằng lock/Lua script atomic khi lấy user ra khỏi queue, xem [03-architecture.md § 3.8.B](./03-architecture.md))
- User rớt kết nối giữa chừng nhưng không bị xoá khỏi queue → "zombie" chiếm chỗ mãi trong hàng đợi
- Chỉ check điều kiện block/report lúc vào queue, không check lại tại thời điểm ghép thật → vẫn ghép nhầm người vừa bị block sau đó (vi phạm nguyên tắc § 10.0.C — "xác minh lại đúng thời điểm hành động")
- Thiếu rate-limit số lần match/giờ → bot có thể spam tạo queue ảo
- **Ticket (yêu cầu ghép) không có state machine rõ ràng** (`queued → matched → confirmed → expired/cancelled`) → dễ xảy ra trạng thái mơ hồ khi 2 sự kiện đến gần như đồng thời (vd user vừa cancel vừa được match)
- Ở quy mô lớn: 1 queue Redis duy nhất không shard theo region/tiêu chí → matcher trở thành hotspot, hoặc match ra 2 người cách nhau nửa vòng trái đất (latency cao khi call)
- Speed-up (trả diamond để ưu tiên) trừ tiền xong nhưng không có gì đảm bảo user thực sự được ưu tiên (không có priority score/queue riêng thực thi) → mất tiền mà không có tác dụng, hoặc ngược lại: có thể trả tiền speed-up nhiều lần liên tiếp để luôn đứng đầu, chèn ép user thường bất công (cần giới hạn số lần/khung giờ)

**Soul Match / chat ẩn danh — giao điểm Matching + ẩn danh, dễ leak danh tính và sai race rating**

- **Leak danh tính trước khi match**: message/session DTO trả userId/nickname/avatar đối phương thay vì role ẩn danh (`me|partner`) → phá toàn bộ giá trị "ẩn danh" của tính năng; profile thật chỉ được trả qua endpoint riêng có guard "đã là bạn"
- **Leak verdict đối phương trước khi chốt**: API session cho biết bên kia đã rate gì (`rude`/`boring`) theo thời gian thực → vector harassment ngược; chỉ expose verdict của chính mình + cờ `matched` sau khi cả 2 `like`
- **2 rating `like` song song không tạo Friendship (hoặc tạo 2 bản)**: READ COMMITTED — mỗi transaction không thấy insert chưa commit của bên kia → cả 2 cùng kết luận "chưa đủ 2 like"; phải serialize 2 rater bằng lock trên session row + unique constraint canonical `(user_low, user_high)` ở DB làm chốt cuối, tạo Friendship trong **cùng transaction** với insert rating
- **Timer phòng chat tính ở client**: hết giờ 2-3 phút nhưng server không tự enforce → sửa client chat vô hạn/rate ngoài cửa sổ; phase phải derive từ timestamp DB + giờ server tại thời điểm hành động (§ 10.0.C)
- **Đổi verdict sau khi đã rate**: rating phải immutable với unique DB `(session, rater)` — replay cùng verdict idempotent, khác verdict → conflict; cho đổi ý = mở đường thăm dò ("like thử xem bên kia like chưa rồi đổi lại")
- **Chat ẩn danh không giữ bằng chứng cho report**: xoá message khi phòng đóng → report "thô lỗ" không còn evidence cho T&S xử lý; message append-only, khoá truy cập qua API thay vì xoá dữ liệu
- **Match lại cặp đã là bạn làm vỡ unique Friendship**: tạo bản ghi trùng/lỗi 500 thay vì idempotent ON CONFLICT DO NOTHING

**Friend Chat 1-1 — chat lâu dài, dễ nhầm lẫn với chat ẩn danh Soul Match**

- **Tạo Conversation lazy ở lần gửi message đầu** thay vì cùng transaction với Friendship → 2 người bạn mới cùng bấm gửi tin đầu tiên gần như đồng thời phải tự lo race tạo phòng chat, lặp lại đúng bug đã giải ở Soul Match; tạo Conversation ATOMICALLY cùng Friendship (ON CONFLICT DO NOTHING) để bất biến "có Friendship ⟺ có Conversation" luôn đúng
- **Nhầm áp dụng che danh tính của Soul Match sang đây**: 2 bên đã unlock profile (đã là bạn) nên senderUserId lộ ra là ĐÚNG, không phải bug — nếu code cũng ẩn `senderRole me|partner` như Soul Match là thừa/sai ngữ cảnh
- **Quên guard membership theo conversationId**: endpoint list/send message không check caller có phải 1 trong 2 user của conversation → IDOR đọc/gửi vào chat của người khác (docs/10 § 10.1.D); conversation không tồn tại và caller không phải thành viên phải trả **cùng 1 mã lỗi**, không làm oracle dò conversationId
- **Coi block/report là guard bắt buộc trước khi Safety module tồn tại**: thêm 1 policy interface/bảng giả để "chừa chỗ" cho tính năng chưa có bảng dữ liệu thật là over-engineering (docs/11) — ghi rõ thành nợ kỹ thuật tường minh trong docs thay vì tự chế guard rỗng

**Streak trò chuyện — race 2 bên gửi gần như đồng thời, dễ sai vì tưởng chỉ cần đếm ngày**

- **Check-rồi-tăng không atomic**: đọc `lastActiveDate` 2 bên rồi mới UPDATE `currentStreak` ở
  câu lệnh riêng → 2 request gần như đồng thời (2 bên cùng gửi tin lúc streak vừa đủ điều kiện
  tăng) đọc cùng state cũ, tăng đôi hoặc mất lượt tăng. Phải khoá row `conversation_streaks` bằng
  `SELECT ... FOR UPDATE` TRONG transaction rồi mới quyết định tăng/reset (test RACE thật bằng
  `Promise.all` 2 `sendMessage` gần như đồng thời, không chỉ mock).
- **Dùng timezone local của client để tính "ngày"** — phá bất biến docs/06; ngày luôn derive từ
  giờ SERVER tại thời điểm xử lý request, không tin timezone/ngày client tự gửi lên.
- **Cron tính/ghi `currentStreak`** thay vì chỉ on-write — cron chỉ được đọc + cảnh báo, ghi
  `lastWarningSentAt`; bất kỳ chỗ nào khác ngoài `recordActivity` (on-write trong `sendMessage`)
  mà ghi `currentStreak`/`longestStreak` là sai kiến trúc của tính năng này.
- **Thiếu guard "cả 2 chiều"** — chỉ cần 1 bên nhắn liên tục nhiều tin trong ngày mà tăng streak
  là bug; phải xác nhận CẢ 2 `lastActiveDate` đều là hôm nay trước khi tăng (chat rỗng 1 chiều
  không được tính).
- **Grace cho gap từ 2 ngày trở lên** hoặc **grace làm tăng streak nhiều hơn 1 lần cho cùng 1
  khoảng trống** — grace chỉ áp dụng đúng `gapDays == 2` (lỡ đúng 1 ngày), gap lớn hơn luôn reset;
  gọi lại `recordActivity` nhiều lần cùng ngày không được tăng thêm (guard
  `lastConfirmedDate != today`).
- **Milestone cộng thẳng diamond không qua ledger** — nếu sau này thưởng tiền theo mốc, bắt buộc
  đi qua `LedgerEntry` double-entry (docs/03 § 3.8.C), không tự cộng field số dư.

**Calling/Signaling/SFU — nơi dễ leak tài nguyên**

- Không giải phóng room trên SFU khi call kết thúc → leak resource, media server quá tải dần
- Billing tick vẫn tiếp tục trừ tiền vài giây sau khi call đã thực sự kết thúc (race giữa event `call.ended` và job trừ tiền định kỳ)
- Không có timeout cho WebSocket signaling → client đơ giữa chừng làm cả 2 bên treo mãi không thoát được phòng
- **Ở quy mô lớn** ([03-architecture.md § 3.8.A](./03-architecture.md)): Party Room vượt capacity
  một LiveKit node → nghẽn/rớt media; multi-node không tự chia một room, nên giữ cap speaker/member
  theo load test và mở ADR nếu một room cần vượt biên đó
- Signaling gửi lệnh điều khiển media (mute, kick, đổi quyền) mà không đợi ACK từ Media Server → state ở signaling nói "đã mute" nhưng thực tế Media Server chưa xử lý xong, gây lệch trạng thái UI/thực tế
- Free-call timer (7 phút/2-3 phút) tính ở client, server chỉ tin báo cáo từ client → user sửa client để gọi miễn phí vô hạn; timer bắt buộc phải tính và enforce ở server

**Party Room — nơi dễ sai phân quyền**

- Audience tự ý unmute mà không qua kiểm tra quyền speaker (chỉ chặn ở UI, không chặn ở server — luôn phải validate lại phía backend)
- Trạng thái phòng (ai đang là speaker) không đồng bộ khi Signaling Gateway chạy nhiều instance (thiếu Redis adapter dùng chung state)
- Host rời phòng (mất kết nối) mà không có cơ chế chuyển quyền host tự động hoặc đóng phòng → phòng "vô chủ" nhưng vẫn tồn tại, chiếm resource SFU
- Số lượng speaker vượt giới hạn cấu hình do 2 request "xin làm speaker" xử lý gần như đồng thời (race condition tương tự Matching, cần lock theo phòng)

**Feed / Social layer — lỗi thường bị bỏ qua vì tưởng "chỉ là tính năng phụ"**

- Fanout-on-write cho tất cả user bất kể có bao nhiêu người theo dõi → user có nhiều follower làm nghẽn hệ thống lúc đăng bài (cần fanout-on-read cho user có follower lớn, hybrid theo ngưỡng)
- Xoá bài viết chỉ xoá ở DB chính nhưng không xoá khỏi cache/feed đã fanout cho follower → bài đã xoá vẫn hiện với người khác
- Like/reaction đếm bằng cách tăng trực tiếp 1 cột counter không transaction → đếm sai khi nhiều request đồng thời (dùng bảng riêng lưu ai đã like + đếm bằng `COUNT` hoặc counter có transaction/atomic increment)
- Block giữa 2 user không lọc bài/comment cũ đã hiển thị trước đó, chỉ chặn tương tác mới
- **Audience per-post chỉ check ở 1 endpoint, không phải guard trung tâm** — thêm `friends`/
  `only_me` mà chỉ lọc ở list feed, quên áp lại ở `getPostOrThrow` (dùng chung cho get/comment/
  like/xoá) → đi thẳng URL `GET /posts/:id` bỏ qua hoàn toàn audience, biến field đó thành trang
  trí không có tác dụng.
- **Feed toàn cục trộn cả `friends`/`only_me`** — bắt buộc check quan hệ bạn cho TỪNG tác giả
  trên 1 trang lớn (N+1 kiểu quan hệ), sai vị trí đặt cost; audience khác `public` chỉ nên lộ qua
  truy vấn 1-tác-giả (profile timeline), không phải feed discovery nhiều tác giả.
- **Story dùng chung bảng/soft-delete với `Post`** — Story ephemeral (hết hạn = filter lúc đọc),
  KHÔNG cần audit trail như Post; nhét chung 1 bảng buộc phải thêm cột phân biệt + logic rẽ nhánh
  không cần thiết, đúng dạng "tự chế lại 1 khái niệm đã khác nhau" (docs/11).
- **Cron sweeper story bị coi là chốt correctness** — đọc "story hiện tại" mà không tự filter
  `expiresAt` (chờ sweeper xoá) thì có khoảng hở hiện story đã hết hạn tới khi sweeper chạy;
  sweeper chỉ dọn rác, read-path PHẢI tự filter độc lập.
- **Seen-list (viewers) không lọc block hiện tại lúc đọc** — chỉ chặn tạo `StoryView` mới khi
  đang block, không lọc lại danh sách cũ → viewer đã xem trước khi bị block vẫn lộ trong danh
  sách nếu không re-check tại thời điểm ĐỌC (docs/10 § 10.0.C).
- **Reply story → DM bỏ qua bất biến "chỉ bạn bè mới có Conversation"** — tự tạo Conversation/
  gửi thẳng vào DB thay vì đi qua `FriendService.sendMessage`/`getConversationWithFriend` sẽ phá
  bất biến "có Friendship ⟺ có Conversation" và bỏ lỡ toàn bộ pipeline
  idempotency/block/realtime/notification đã có sẵn.

**Gift — giao điểm Economy + Realtime, dễ nhân đôi giá trị**

- Trừ diamond người tặng và cộng diamond/exp người nhận không nằm trong cùng 1 transaction/saga → có thể trừ mà không cộng (mất tiền vào hư không) hoặc cộng mà không trừ (sinh tiền từ hư không) nếu 1 bước fail giữa chừng
- Animation/hiệu ứng tặng quà bắn ra ở client trước khi server xác nhận giao dịch tiền thành công → user thấy hiệu ứng nhưng giao dịch thực tế fail, gây hiểu lầm/khiếu nại
- Catalog quà có giá đổi theo thời gian (khuyến mãi) nhưng client cache giá cũ và server không kiểm tra lại giá tại đúng thời điểm tặng

**Avatar / Item / Inventory — nơi dễ bị duplicate item**

- Đổi/trang bị item không kiểm tra user thực sự sở hữu item đó (IDOR trên `itemId`) → mặc item của người khác
- Race condition khi "sử dụng" 1 item có số lượng giới hạn (vd item event) → 2 request dùng cùng lúc dẫn tới dùng vượt số lượng sở hữu, tương tự lỗi nhân đôi vật phẩm phổ biến trong game

**Frontend (browser) — lỗi kinh điển client-side, khác họ với lỗi backend ở trên** ([docs/13](./13-frontend-coding-standards.md))

- **Copy server state vào `useState`/store rồi render từ bản copy**: mutation xong gọi `setQueryData`/`setState` tự dựng kết quả thay vì để server trả trạng thái mới — refetch xong UI vẫn hiện bản cũ vì đang đọc từ bản copy, không phải từ query (cấm ở [13 § 13.4](./13-frontend-coding-standards.md))
- **Stale closure trong socket listener**: đăng ký handler 1 lần lúc mount, handler giữ tham chiếu state/props tại thời điểm đó (vd `roomId`) — event đến sau khi state đã đổi (đổi phòng, logout rồi login lại) vẫn xử lý theo giá trị cũ vì listener chưa được đăng ký lại
- **Thiếu cleanup listener khi unmount**: mỗi lần component mount lại mà không gỡ listener cũ → nhiều listener cộng dồn, 1 event bị xử lý N lần với N tăng dần theo số lần mount — không lộ ra khi test tay 1 lần, chỉ lộ khi dùng lâu (điều hướng qua lại nhiều lần)
- **Double-submit do thiếu gate trên hành động, không chỉ thiếu disable UI**: nút bấm nhanh 2 lần trước khi `isPending` kịp cập nhật, hoặc gọi lại mutation từ 2 chỗ khác nhau gần như đồng thời — chống thật là idempotency key phía server ([13 § 13.4](./13-frontend-coding-standards.md)), disable nút chỉ là lớp UX phụ
- **Sinh idempotency key MỚI mỗi lần gọi (kể cả lúc retry vì lỗi mạng)**: vô hiệu hoá hẳn cơ chế idempotency phía backend — request timeout rồi retry với key mới bị server coi là giao dịch khác, có thể trừ tiền/tặng quà 2 lần dù client tưởng đang "thử lại y hệt"
- **Tin dữ liệu tính ở client để quyết định cho phép hành động** (giá hiển thị, số dư còn lại, VIP còn hạn) thay vì luôn dựa trên response mới nhất từ server — client lệch một nhịp so với server (do cache, do request khác vừa chạy) là ra quyết định sai
- **Reconnect socket nhưng không refetch REST**: coi im lặng trong lúc mất kết nối là "không có gì đổi" — event đã miss trong lúc rớt mạng không được server gửi lại, UI lệch khỏi state thật cho tới lần F5 tiếp theo (cấm ở [13 § 13.8](./13-frontend-coding-standards.md))
- **Guard route/ẩn UI theo role bị coi là chốt chặn thật**: route bị ẩn nhưng API đứng sau vẫn không có guard ở server, hoặc 1 đường khác (deep link, gọi thẳng hàm) bỏ qua được UI đã ẩn — enforcement thật luôn ở backend guard ([12 § 12.9](./12-frontend-architecture.md)), ẩn ở FE chỉ là UX
- **Effect tự-kết-nối-lại retry vô hạn vì gate theo `isPending`/`error` thay vì theo "đã thử chưa"**: effect kiểu "đã là member/đã có session thì tự `connect()` lại" mà điều kiện chạy lại dựa vào `isPending`/`error` của chính mutation đó sẽ có khoảng hở — REST của bước 1 (vd join room) luôn xong nhanh hơn bước 2 phụ thuộc nó (vd LiveKit `room.connect()`), nên effect thấy "chưa kết nối, không pending, không lỗi (hoặc đã lỗi ổn định)" và tự gọi lại liên tục, nhanh hơn round-trip thật — nếu request đó bắt đầu bị rate-limit thì lặp vô hạn không backoff (đúng dạng "chọn sai chiến lược cho tài nguyên tranh chấp" ở § 10.1.C, bắt được thật ở Party Room: 1636 request `join` trong ~6 giây). Chốt đúng là gate bằng 1 ref/flag "đã tự thử chưa" cho vòng đời component, chỉ tự thử đúng 1 lần; mọi lần sau là hành động thủ công của user (nút "Kết nối lại").

**Distributed system (cross-cutting, áp dụng cả khi còn là modular monolith lẫn khi đã tách service)**

- Publish event trước khi transaction DB commit xong → consumer nhận event nhưng data chưa thực sự tồn tại (dual-write problem) → nên dùng **Outbox Pattern**
- Event xử lý không idempotent → nếu Kafka/RabbitMQ gửi lại message (retry), xử lý 2 lần gây lệch dữ liệu (vd cộng diamond 2 lần) → dùng **Inbox Pattern**, kiểm tra event id đã xử lý chưa trước khi xử lý
- Không có circuit breaker khi gọi Economy module từ Matching/Calling → 1 phần chết kéo sập cả chuỗi
- Không xử lý thứ tự event (vd `call.started` xử lý sau `call.ended` do độ trễ mạng) → sai trạng thái session

**Trust & Safety / tuân thủ — đặc thù nhạy cảm của app match ẩn danh với người lạ**

- Thiếu cơ chế xác thực độ tuổi đủ mạnh khi đăng ký (chỉ hỏi tuổi qua form, không có gì ngăn khai gian) — đây là rủi ro pháp lý/reputation nghiêm trọng cho loại app ghép ngẫu nhiên qua voice/video với người lạ, nên bắt buộc có tầng kiểm soát (hạn chế tính năng cho tài khoản chưa xác minh, ưu tiên xử lý nhanh các report liên quan đến trẻ vị thành niên)
- Trust score bị hạ nhưng không có audit log → khó điều tra khi có khiếu nại
- Report bị lạm dụng để "vote kick" người khác (report giả hàng loạt) nhưng hệ thống không rate-limit hay phát hiện pattern bất thường
- Unmatch/block chỉ ẩn ở UI nhưng vẫn cho phép bên kia tìm lại qua tính năng khác (feed, party room công khai) → "block" không thực sự cắt hết điểm chạm giữa 2 user

**Discovery — duyệt user chủ động lặp lại nhiều lần, dễ sai vì tưởng giống Matching**

- **Snapshot hidden set 1 lần rồi tái dùng cho nhiều trang** — block/report xảy ra GIỮA lúc user
  đang lướt qua nhiều trang kết quả phải có hiệu lực NGAY ở trang tiếp theo, không đợi tới lần
  gọi API mới từ đầu; đúng tinh thần § 10.0.C (xác minh lại đúng thời điểm hành động, không chỉ
  lúc bắt đầu) — khác Matching nơi filter chặn snapshot 1 lần lúc ghép là ĐÚNG vì ghép chỉ xảy ra
  1 lần, còn Discovery là duyệt lặp lại.
- **Nhầm dùng cooldown kiểu Matching (`SAFETY_REMATCH_COOLDOWN_DAYS`) cho report** — Discovery là
  màn duyệt nhiều lần/ngày, ẩn sau report phải là **vĩnh viễn** (đọc thẳng bảng `reports`, không
  qua cooldown), khác hẳn ngữ nghĩa ghép cặp 1 lần của Matching.
- **Tự thêm field nhạy cảm (tuổi chính xác, tọa độ, region chi tiết) vào `PublicProfileDto` dùng
  chung** — DTO đó phục vụ cả Soul Match reveal lẫn Friend list với bất biến "giữ ẩn danh"; field
  riêng của 1 tính năng duyệt phải là DTO composition riêng (vd `ageBucket`), không sửa DTO gốc.
- **Cho client tự gửi `excludeGuests`/tiêu chí ẩn danh sách loại trừ** — các quyết định "ai bị ẩn
  khỏi kết quả" (banned, guest, block, report) phải luôn do server tự quyết từ trạng thái/config,
  không nhận từ query param client (khác filter sở thích như gender/age/region vốn dĩ client được
  quyền chọn).
- **Tin `age` thô do client gửi** thay vì tính tuổi ở server từ `birthDate` lưu sẵn — filter tuổi
  chỉ nhận `ageMin`/`ageMax` rồi server tự quy đổi sang khoảng `birthDate` để query, tránh client
  tự khai tuổi khác thực tế qua tham số filter.
- **Report bị lạm dụng để tự-ẩn khỏi Discovery của người khác** (biến thể của lỗi "vote kick" ở
  Trust & Safety phía trên) — vì ẩn là vĩnh viễn và 2 chiều, 1 report giả cũng đủ khiến 2 bên
  không bao giờ thấy nhau qua Discovery nữa; chấp nhận được ở mức độ Discovery (không chặn được
  matching/chat, chỉ ảnh hưởng 1 tính năng duyệt), nhưng rate-limit/pattern-detect cho report vẫn
  phải nằm ở Safety module, không phải việc của Discovery.

**Mood status — append-only đơn giản nhưng dễ sai vì tưởng cần state machine**

- **Update/xoá dòng `mood_status_events` thay vì insert dòng mới** — set/clear PHẢI append-only
  (đúng tinh thần ledger/report); "mood hiện tại" derive từ dòng MỚI NHẤT khi đọc, không có cột
  mutable nào đại diện trạng thái hiện tại.
- **Cron dọn mood hết hạn thay vì derive-khi-đọc** — không có tài nguyên (SFU, ledger, resource
  ngoài) cần dọn cho 1 dòng hết hạn; cron ở đây là over-engineering, chỉ cần so `expiresAt` với
  giờ server tại thời điểm đọc.
- **Thiếu unique constraint idempotency ở DB cho set/clear** — client retry (mất mạng) tạo 2 dòng
  cho cùng 1 intent; đúng như Economy, check-rồi-insert ở code không đủ, phải là unique constraint
  DB + catch unique-violation-rồi-đọc-lại.
- **Thêm mood vào `PublicProfileDto` dùng chung** — DTO đó có bất biến ẩn danh dùng ở Soul Match
  reveal + Friend list; mood phải là composition riêng (`getPublicMood`) do call site tự gộp, không
  sửa DTO gốc.
- **Wire `getPublicMood` vào card ẩn danh trước-match Soul Match** — phá invariant ẩn danh
  (docs/06); đây là kỷ luật ở CALL SITE, không có cờ nào trong Mood service tự chặn được vì service
  không biết ngữ cảnh gọi.
- **Dùng nhầm `SafetyService.getHiddenUserIds` (bao gồm report) thay vì `getBlockedUserIds`** —
  Mood chỉ ẩn theo block active (2 chiều), không xét report; nhầm hàm sẽ ẩn quá mức so với thiết
  kế (khác Discovery, nơi report cũng ẩn vĩnh viễn — 2 tính năng có ngữ nghĩa khác nhau, không dùng
  chung 1 hàm).
- **Scaffold cột `status` (approve/pending) khi chưa ship free-text** — W1 chỉ preset (auto-approve
  toàn bộ); thêm cột cho 1 tính năng (free-text + moderation) chưa có timeline là dựng abstraction
  để dành (docs/11) — thêm bằng migration mới khi free-text thật sự ship.

**Movie Match — phòng xem chung, dễ nhầm với Party Room/Calling nhưng KHÔNG có tiền/SFU**

- **Tự chế lại quan hệ "được xem chung với ai"** thay vì tái dùng `Friendship` đã có — tạo bảng
  invite/relationship riêng cho Movie Match là trùng lặp không cần thiết (docs/11 § chống
  over-engineering); chỉ 2 user đã là bạn mới tạo được `MovieSession`.
- **Tự chế lại chat riêng cho Movie Match** thay vì tái dùng `Conversation` của Friend Chat —
  2 người xem chung đã là bạn nên đã có `Conversation`; thêm bảng message thứ 2 cho cùng 1 cặp
  user là 2 nguồn sự thật cho cùng 1 khái niệm "tin nhắn giữa 2 người bạn".
- **Coi playback state (`positionSeconds`, `isPlaying`) như dữ liệu tài chính rồi áp
  `SELECT ... FOR UPDATE`/idempotency key kiểu Economy** — đây là state UX thuần tuý, sai lệch vài
  giây không gây hại; over-engineering lock cho use-case này là đặt sai loại correctness (khác hẳn
  ledger, xem [11-engineering-principles.md](./11-engineering-principles.md)). Ngược lại vẫn cần
  1 nguồn sự thật server-side (không tin timestamp tự tính của client) để user thứ 3 join lại
  giữa chừng thấy đúng vị trí gần nhất.
- **Không giới hạn 1 session active/user**: thiếu ràng buộc khiến 1 user mở nhiều `MovieSession`
  cùng lúc với nhiều bạn khác nhau, gây rối trạng thái phòng nào đang "xem cùng ai" (cùng tinh
  thần 1-user-1-queue của Matching/Party Room).
- **IDOR theo `movieSessionId`**: thiếu guard caller phải là 1 trong 2 participant — trả cùng 404
  cho "không tồn tại" và "không phải thành viên" (cùng pattern Friend Chat/Soul Match).
- **Video URL không validate nguồn** (chỉ chấp nhận domain cho phép, vd YouTube) — mở URL bất kỳ
  biến tính năng thành proxy/link phishing.

**Palm Match — nội dung giải trí, dễ chủ quan bỏ qua vì "chỉ là random"**

- **Random thật (không seed) mỗi lần gọi cùng input** khiến cùng 1 user hỏi lại trong cùng ngày ra
  2 kết quả khác nhau — cảm giác giả tạo/không đáng tin của tính năng horoscope; phải seed
  deterministic theo `(userId, category, ngày server)` để cùng ngày ra cùng 1 kết quả, đổi ngày mới
  đổi kết quả.
- **Seed lộ ra client** (client tự tính/gửi seed) thay vì server tự tính từ `userId` + giờ server —
  cho phép client "quay số" tới khi ra kết quả đẹp bằng cách tự chọn seed.
- **Không có fallback khi catalog rỗng theo category** → 500 thay vì lỗi domain rõ ràng.
- **Coi đây là AI thật** (gọi LLM sinh nội dung tự do) — sai với chính đặc tả tính năng (template +
  random, không cần AI thật, xem docs/01 #5); giữ nội dung trong catalog `PalmReadingTemplate` để
  kiểm soát được tông giọng/không sinh nội dung nhạy cảm ngoài ý muốn.

**Mini Game — giao điểm 2 người chơi realtime, dễ lộ nước đi hoặc double-move**

- **Trả nước đi của đối phương trước khi cả 2 đã nộp** (API/realtime payload chứa move của bên
  kia ngay khi họ vừa nộp) — phá tính "đồng thời" của trò chơi, bên nộp sau luôn thắng vì đã biết
  trước; chỉ resolve (tính thắng/thua + trả cả 2 nước đi) khi ĐỦ CẢ HAI đã nộp.
- **Cho nộp lại nước đi sau khi đã nộp** (update thay vì chặn) — 1 bên thấy ván chưa resolve rồi
  đổi ý sau khi ngầm đoán được đối phương đã chọn gì qua kênh khác (chat).
- **Race 2 request nộp move cùng lúc** ghi đè lẫn nhau hoặc resolve 2 lần — nộp move phải là
  update có điều kiện (chỉ set khi cột move đang null) làm chốt chặn DB, không phải check-rồi-ghi.
- **Không giới hạn 1 session active/cặp** — vd cho phép tạo vô số ván mới trong lúc ván cũ chưa kết
  thúc, gây nhầm lẫn ván nào đang chờ move.
- **Mở rộng thêm game type mà không tách rule engine** — nhét if/else theo `gameType` thẳng vào
  service chung làm phình God Service; nếu thêm game thứ 2 (đua xe/giải đố ở docs/01 #11), tách
  logic resolve theo từng game vào 1 chỗ riêng thay vì rẽ nhánh chồng chất.

> Danh sách trên không đầy đủ — khi bắt đầu 1 domain mới chưa có ở đây, viết thêm 1 mục con mới
> theo đúng cấu trúc và tư duy của § 10.0, thay vì chỉ áp checklist cũ.

## 10.3 Cách áp dụng checklist này

- **Luôn bắt đầu bằng § 10.0** (liệt kê luồng + giả định) trước khi đọc code chi tiết — đây là bước hay bị bỏ qua nhất, vì tư duy tự nhiên là đọc code trước, nhưng lỗi logic nghiệp vụ chỉ lộ ra khi tư duy theo luồng nghiệp vụ trước, code sau.
- Dùng làm **PR review template**: mỗi PR liên quan tới Economy/Matching/Calling/Party Room/Feed/Gift/Avatar/Trust & Safety phải tick qua đúng mục tương ứng ở § 10.2 trước khi merge.
- Yêu cầu agent **tự chấm lại code theo đúng § 10.0, 10.1 và 10.2** sau khi viết xong 1 module, trước khi báo "xong" — coi đây là bước bắt buộc, không phải tuỳ chọn. Agent phải chỉ rõ các giả định về hành vi user và mỗi giả định được chặn ở đâu trong code.
- Mỗi giai đoạn, agent phải đọc lại phần § 10.2 vì nhóm lỗi đặc thù thay đổi theo domain.

---

[← 09 · Practical Notes](./09-practical-notes.md) · [sources →](./sources.md)
