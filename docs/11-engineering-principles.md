# 11. Engineering Principles

Đây là bộ nguyên tắc dùng để quyết định code nên nằm ở đâu, module có nên tách
không, abstraction có đáng tạo không, và một thay đổi đã đủ an toàn để bàn giao
chưa. Đây là la bàn thiết kế dùng chung cho người đọc, reviewer và AI; chi tiết
framework vẫn nằm ở [05-coding-standards.md](./05-coding-standards.md), còn luật
nghiệp vụ cụ thể nằm ở [06-domain-rules.md](./06-domain-rules.md).

## 11.1. Nguyên tắc nền tảng

Khi hai mục tiêu kéo theo hai hướng khác nhau, dùng thứ tự ưu tiên sau thay vì chọn theo cảm
tính:

`correctness + security → domain ownership + boundary → explicit contract → simplicity/YAGNI
→ khả năng mở rộng codebase/team → runtime performance khi có bằng chứng`.

"Scale" không tự động thắng KISS/YAGNI. Cấu trúc deterministic giúp nhiều người/agent làm
song song được ưu tiên từ đầu; tối ưu runtime, abstraction và extension point chỉ thêm khi
contract hiện tại hoặc số liệu vận hành thực sự đòi hỏi.

### Domain giữ ý nghĩa của chính nó

Module sở hữu business rule, dữ liệu, type và quyền ghi của domain đó.

- Economy sở hữu ledger, wallet và quy tắc diamond.
- Matching sở hữu ticket, queue và state machine ghép cặp.
- Module khác không query bảng nội bộ hoặc gọi service nội bộ của module đó.
- Giao tiếp qua public API của module, DTO hoặc event có schema rõ ràng.

Đây là **bounded context** và **data ownership**: ai sở hữu ý nghĩa thì người đó
giữ cách diễn giải và thay đổi nó.

### High cohesion, low coupling

Những thứ cùng thay đổi vì một lý do nên ở gần nhau; module khác chỉ biết contract
public, không biết implementation bên trong. Không tách file/class chỉ vì file
dài, và không gom vào `common/` chỉ vì có thể tái sử dụng.

### Dependency direction

Dependency đi một chiều, không tạo vòng lặp:

- `common/` là hạ tầng trung lập, không import module nghiệp vụ.
- Module chỉ import module khác qua `index.ts` public API.
- `libs/` không import ngược `apps/`.
- Khi hai module cần nói chuyện, contract nằm ở phía không phụ thuộc implementation
  của phía kia.

### Single source of truth

Mỗi business rule, error code, config, key, schema hoặc type contract có một nơi
chủ quản. Nơi khác import hoặc derive, không copy lại.

Riêng Economy: `LedgerEntry` là nguồn sự thật của tiền; `Wallet.balance` chỉ là
snapshot có thể rebuild.

### Explicit contract ở mọi boundary

- HTTP: request/response DTO và OpenAPI.
- Module nội bộ: public API + type/interface rõ ràng.
- Event/Kafka: schema có `version`, consumer chịu được version cũ.
- Database migration: thay đổi additive và có kế hoạch tương thích khi cần.

Không truyền object mà consumer phải tự đoán field, và không để một contract bị
định nghĩa ở hai nơi.

## 11.2. Nguyên tắc viết code

### SRP theo lý do thay đổi

Một class nên có một nhóm lý do thay đổi, không phải mỗi class chỉ được có một
method. `RefundService` tách khỏi `LedgerService` vì refund và ghi sổ có vòng đời
và lý do thay đổi khác nhau, dù cùng thuộc Economy.

### DRY có chọn lọc, AHA trước abstraction

Hai đoạn code giống nhau chưa chắc có cùng ý nghĩa. Chỉ đưa vào `common/` hoặc
helper dùng chung khi cả ý nghĩa, contract và cách thay đổi thực sự giống nhau.
Tránh tạo `interfaces/`, `helpers/`, `repositories/` hoặc folder rỗng để dành.

### KISS và YAGNI

Giải pháp nhỏ nhất đáp ứng đúng business rule hiện tại là mặc định. Không xây
extension point, microservice, generic framework hoặc abstraction tương lai khi
chưa có nhu cầu thật.

### Comment nói WHY, không lặp lại WHAT

Tên, type và cấu trúc nên giải thích code đang làm gì. Comment chỉ nên giữ khi
giải thích được điều code không tự nói rõ:

- business rule hoặc bất biến;
- lý do bảo mật, concurrency, lock và thứ tự xử lý;
- giới hạn của framework/third-party;
- quyết định tạm thời có ngày xem lại hoặc liên kết tới ADR/spec.

Nếu cần comment để giải thích một đoạn code đang làm gì, ưu tiên refactor cho code
tự rõ hơn. Không bắt comment cho mọi constant có tên đã đủ nghĩa.

## 11.3. Tính đúng đắn và an toàn

### Correctness trước performance

Postgres là nguồn sự thật cho trạng thái nghiệp vụ và tiền. Redis/cache/queue là
tối ưu hoặc projection; khi lệch phải có cách rebuild từ nguồn sự thật.

### Idempotency và transaction cho side effect

Mọi thao tác có tác dụng phụ phải chịu được retry và race condition: tiền, queue,
gift, settle call và publish event. Không dùng kiểu “check rồi insert”; dùng unique
constraint, transaction và lock/optimistic concurrency phù hợp.

### Security và privacy mặc định là deny-by-default

Validate ở boundary, kiểm tra ownership ở server, phân quyền tại backend, không log
secret/PII và không tin giá, role, thời lượng hoặc trạng thái do client gửi lên.
Ngoại lệ dev-only phải được chặn cứng khi chạy production.

### Failure isolation

Dependency bên ngoài và module khác phải có timeout, retry có giới hạn, idempotent
consumer và trạng thái lỗi rõ ràng. Một dependency chậm hoặc chết không được làm
toàn bộ request chain treo vô hạn hoặc ghi dữ liệu nửa vời.

## 11.4. Test và vận hành

### Test behavior và invariant, không chạy theo coverage mù quáng

Coverage là chỉ báo, không phải mục tiêu cuối. Test phải chứng minh behavior và
bất biến quan trọng:

- Economy: double-entry cân bằng, không credit/trừ hai lần, race không làm âm sai.
- Matching: hai worker không lấy cùng ticket, transition hợp lệ, block được kiểm
  tra lại tại thời điểm ghép.

### Observability là một phần của thiết kế

Luồng HTTP cần request/trace ID; job cần job run ID và event/transaction ID phù
hợp. Log structured, metric cho queue/ledger và audit cho hành vi nhạy cảm phải
được thiết kế cùng feature, không đợi đến lúc production lỗi mới thêm.

### Backward compatibility và khả năng rollback

Thay đổi API, event, database và config phải có chiến lược tương thích hoặc version
mới. Migration không sửa lịch sử đã chạy; thay đổi nguy hiểm cần rollback/forward
plan và kiểm tra dữ liệu trước khi deploy.

## 11.5. Khi nào tách module hoặc scale riêng

Bắt đầu bằng modular monolith. Tách sub-service trong cùng module khi có trách
nhiệm, transaction boundary, dependency hoặc lifecycle độc lập rõ ràng.

Chỉ tách thành deployable service khi có bằng chứng vận hành: cần scale khác, SLO
khác, compliance/công nghệ khác, ownership/release độc lập, hoặc dependency đang
gây nghẽn. Ranh giới dữ liệu và contract phải rõ trước khi tách; không tách chỉ vì
file dài, có nhiều folder hoặc muốn “để dành cho tương lai”.

## 11.6. Bộ nhớ nhanh cho dự án này

> Domain giữ logic, dữ liệu và type của chính nó.  
> Common chỉ giữ thứ trung lập, không thuộc domain nào.  
> Qua ranh giới thì dùng contract rõ ràng; không đụng nội tạng của nhau.  
> Chỉ tách hoặc scale khi sự phụ thuộc hay số liệu vận hành buộc phải tách.
