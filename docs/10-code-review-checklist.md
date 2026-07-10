[← 09 · Practical Notes](./09-practical-notes.md) · **10 · Code Review Checklist** · [11 · NFR & Production Readiness →](./11-nfr-and-production-readiness.md)

# 10. Checklist Review Code — lỗi phổ quát + lỗi logic nghiệp vụ + lỗi đặc thù dự án

> Dùng phần này làm checklist khi review PR, hoặc yêu cầu Claude Code **tự chấm lại code theo đúng các mục dưới trước khi coi 1 task là "xong"** — đây là bước bắt buộc, được nhắc lại trong `/CLAUDE.md` ở root. Mục 10.1/10.2 nghiêng nhiều về lỗi kỹ thuật (concurrency, security, performance) nhưng còn thiếu 1 lớp lỗi khác — lỗi mà code chạy hoàn toàn "đúng như đã viết", compile sạch, test pass, nhưng **luật nghiệp vụ đằng sau lại sai hoặc thiếu**. Loại lỗi này giới bảo mật gọi là **business logic vulnerability / logic flaw**: **không có scanner hay linter nào bắt được**, vì bản thân syntax và luồng thực thi không sai — chỉ có người (hoặc agent) hiểu đúng domain mới review ra được. § 10.0 dưới đây là cách tư duy để review ra loại lỗi này; 10.1 và 10.2 bổ sung nhiều mục cụ thể dựa theo cách tư duy đó.

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
> - **Property test bất biến double-entry**: sinh ngẫu nhiên chuỗi giao dịch (nạp/mua VIP/gift/refund), sau mỗi bước assert **tổng Nợ = tổng Có theo từng currency** và `rebuildWallet()` khớp snapshot. Đây là cái linter/review không thay được.
> - **Test concurrency thật trên Postgres**: N request song song cùng trừ 1 ví (không lost update), N request song song cùng `idempotency_key` (chỉ 1 giao dịch được tạo), refund song song với tiêu tiền.
> - **Test refund-sau-tiêu**: user nạp → tiêu hết → refund → assert balance âm đúng, tiêu tiếp bị chặn, nạp bù trừ nợ đúng.

**Matching — nơi dễ sai logic ghép cặp**
- Race condition: 2 matching worker cùng lấy 1 user ra khỏi queue và ghép với 2 người khác nhau cùng lúc → user bị match đôi (khắc phục bằng lock/Lua script atomic khi lấy user ra khỏi queue, xem [03-architecture.md § 3.8.B](./03-architecture.md))
- User rớt kết nối giữa chừng nhưng không bị xoá khỏi queue → "zombie" chiếm chỗ mãi trong hàng đợi
- Chỉ check Safety lúc vào queue, không re-check block hai chiều/enforcement/age tại pair commit → vẫn ghép người vừa bị block/restrict ([Safety spec § 10](./services/safety-service.md))
- Thiếu rate-limit số lần match/giờ → bot có thể spam tạo queue ảo
- **Ticket (yêu cầu ghép) không có state machine rõ ràng** (`queued → matched → confirmed → expired/cancelled`) → dễ xảy ra trạng thái mơ hồ khi 2 sự kiện đến gần như đồng thời (vd user vừa cancel vừa được match)
- Ở quy mô lớn: 1 queue Redis duy nhất không shard theo region/tiêu chí → matcher trở thành hotspot, hoặc match ra 2 người cách nhau nửa vòng trái đất (latency cao khi call)
- Speed-up (trả diamond để ưu tiên) trừ tiền xong nhưng không có gì đảm bảo user thực sự được ưu tiên (không có priority score/queue riêng thực thi) → mất tiền mà không có tác dụng, hoặc ngược lại: có thể trả tiền speed-up nhiều lần liên tiếp để luôn đứng đầu, chèn ép user thường bất công (cần giới hạn số lần/khung giờ)

**Calling/Signaling/SFU — nơi dễ leak tài nguyên**
- Không giải phóng room trên SFU khi call kết thúc → leak resource, media server quá tải dần
- Billing tick vẫn tiếp tục trừ tiền vài giây sau khi call đã thực sự kết thúc (race giữa event `call.ended` và job trừ tiền định kỳ)
- Không có timeout cho WebSocket signaling → client đơ giữa chừng làm cả 2 bên treo mãi không thoát được phòng
- **Ở quy mô lớn** ([03-architecture.md § 3.5](./03-architecture.md)): một LiveKit self-host room phải fit một node; không giả định room tự cascade. Hard-cap speaker/participant theo capacity test `publisher × subscriber`, route room mới sang node khác và drain node an toàn
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

**Gift — giao điểm Economy + Realtime, dễ nhân đôi giá trị**
- Trừ diamond người tặng và cộng diamond/exp người nhận không nằm trong cùng 1 transaction/saga → có thể trừ mà không cộng (mất tiền vào hư không) hoặc cộng mà không trừ (sinh tiền từ hư không) nếu 1 bước fail giữa chừng
- Animation/hiệu ứng tặng quà bắn ra ở client trước khi server xác nhận giao dịch tiền thành công → user thấy hiệu ứng nhưng giao dịch thực tế fail, gây hiểu lầm/khiếu nại
- Catalog quà có giá đổi theo thời gian (khuyến mãi) nhưng client cache giá cũ và server không kiểm tra lại giá tại đúng thời điểm tặng

**Avatar / Item / Inventory — nơi dễ bị duplicate item**
- Đổi/trang bị item không kiểm tra user thực sự sở hữu item đó (IDOR trên `itemId`) → mặc item của người khác
- Race condition khi "sử dụng" 1 item có số lượng giới hạn (vd item event) → 2 request dùng cùng lúc dẫn tới dùng vượt số lượng sở hữu, tương tự lỗi nhân đôi vật phẩm phổ biến trong game

**Distributed system (cross-cutting, áp dụng cả khi còn là modular monolith lẫn khi đã tách service)**
- Publish event trước khi transaction DB commit xong → consumer nhận event nhưng data chưa thực sự tồn tại (dual-write problem) → nên dùng **Outbox Pattern**
- Event xử lý không idempotent → nếu Kafka/RabbitMQ gửi lại message (retry), xử lý 2 lần gây lệch dữ liệu (vd cộng diamond 2 lần) → dùng **Inbox Pattern**, kiểm tra event id đã xử lý chưa trước khi xử lý
- Không có timeout/circuit breaker/bulkhead ở **network boundary** sau khi tách service/provider → 1 phần chết kéo sập chuỗi; không áp circuit breaker máy móc cho DI call cùng process
- Không xử lý thứ tự event (vd `call.started` xử lý sau `call.ended` do độ trễ mạng) → sai trạng thái session

**Trust & Safety / tuân thủ — review cùng [Safety R-007 spec](./services/safety-service.md)**
- Coi DOB tự khai là age assurance; không có policy theo market/expiry/manual fallback, suspected-minor restriction/escalation và appeal
- Block lưu directed nhưng chỉ enforce một chiều, hoặc chỉ ẩn UI; phải deny interaction nếu active block ở bất kỳ chiều nào và re-check ở pair/message/token/join/speaker/gift/feed boundary
- Block/unblock/report không có operation scope + request hash + DB transaction/audit, nên retry/race tạo duplicate hoặc state/audit lệch; unblock vô tình khôi phục friendship/invite cũ
- Report priority/trust penalty do client chọn hoặc auto-punish ngay khi submit; thiếu chống brigading/correlated false report/rate limit và làm lộ reporter cho subject
- Evidence nhận arbitrary URL/blob/base64, không verify ownership/provenance/hash/scan, không encryption/retention/legal hold/access audit; moderator có thể xem/export không purpose/authorization
- Hai moderator claim/decide cùng case, sửa decision cũ thay vì append superseding decision, enforcement/cache/event reorder làm restriction cũ sống lại
- Appeal do chính reviewer ban đầu xử lý, không có eligibility/SLA/independent review; overturn không atomic với lift enforcement/notification/audit
- Device/IP bị coi là identity chắc chắn và permanent-ban nhiều account dùng chung; thiếu confidence/expiry/privacy/false-positive recovery
- Minor/emergency signal không page specialist/on-call hoặc ngược lại tự động disclosure/ban không qua policy/human authorization/runbook
- Enforcement chỉ ở Auth/Matching create, không re-check tại action boundary; Safety outage silently fail-open cho pair/message/call/party/gift high-risk

> Danh sách trên không đầy đủ — khi bắt đầu 1 domain mới chưa có ở đây (vd Movie Match, Palm Match), viết thêm 1 mục con mới theo đúng cấu trúc và tư duy của § 10.0, thay vì chỉ áp checklist cũ.

## 10.3 Cách áp dụng checklist này

- **Luôn bắt đầu bằng § 10.0** (liệt kê luồng + giả định) trước khi đọc code chi tiết — đây là bước hay bị bỏ qua nhất, vì tư duy tự nhiên là đọc code trước, nhưng lỗi logic nghiệp vụ chỉ lộ ra khi tư duy theo luồng nghiệp vụ trước, code sau.
- Dùng làm **PR review template**: mỗi PR liên quan tới Economy/Matching/Calling/Party Room/Feed/Gift/Avatar/Safety phải tick đúng mục ở § 10.2; Safety còn phải đối chiếu acceptance ở [Safety spec § 14](./services/safety-service.md).
- Yêu cầu Claude Code **tự chấm lại code theo đúng § 10.0, 10.1 và 10.2** sau khi viết xong 1 module, trước khi báo "xong" — coi đây là bước bắt buộc, không phải tuỳ chọn. Có thể yêu cầu Claude Code viết ra rõ ràng: "các giả định về hành vi user mà module này đang đặt ra là gì, và mỗi giả định được chặn ở đâu trong code."
- Định kỳ (mỗi giai đoạn) đưa lại phần § 10.2 cho Claude Code đọc, vì mỗi giai đoạn mới sẽ có nhóm lỗi đặc thù khác nhau nổi lên.

---
[← 09 · Practical Notes](./09-practical-notes.md) · [11 · NFR & Production Readiness →](./11-nfr-and-production-readiness.md)
