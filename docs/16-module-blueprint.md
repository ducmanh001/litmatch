# 16. Module Blueprint — Quy chuẩn xây dựng module NestJS

Đây là bản thiết kế triển khai chuẩn cho module trong
`apps/core-api/src/modules`. Con người và agent dùng tài liệu này để quyết định
module có những file/folder nào, đặt ở đâu, public API là gì và kiểm tra hoàn tất
ra sao.

## 16.1 Phạm vi và thứ tự ưu tiên

- Module domain mới mặc định nằm trong `core-api`, không tạo backend deployable mới.
- Blueprint này cụ thể hóa `docs/05-coding-standards.md § 5.3`; không lặp lại hoặc tạo
  luật khác trong skill.
- `AGENTS.md`, architecture/ADR và domain spec có quyền cao hơn blueprint này khi
  quyết định invariant, boundary hoặc nghiệp vụ.
- `.agents/skills/new-module/SKILL.md` chỉ là quy trình thực thi blueprint, không phải
  nguồn luật thứ hai.

## 16.2 Cây module chuẩn

```text
<module>/
├── <module>.module.ts              # bắt buộc
├── <module>.service.ts             # facade nghiệp vụ/public API nếu module có behavior
├── <module>.controller.ts          # bắt buộc nếu module nhận HTTP request
├── <module>.errors.ts               # taxonomy lỗi domain duy nhất
├── <module>.constants.ts            # optional: hằng cấp module/key builder
├── index.ts                         # public API duy nhất
├── <module>.service.spec.ts         # unit test đặt cạnh facade, nếu có service
├── <module>.integration.spec.ts     # optional: test cả module + DB thật, đặt ở gốc
├── dto/                             # optional: HTTP input/output DTO
├── entities/                        # optional: TypeORM entity/persistence model
├── services/                        # optional: sub-service nghiệp vụ qua DI
├── repositories/                    # optional: custom data-access/query adapter
├── ports/                           # optional: boundary/strategy/DI port
├── clients/                         # optional: client gọi API bên thứ ba
├── jobs/                            # optional: worker/scheduler/background job
├── webhooks/                        # optional: controller xử lý webhook bên thứ ba
├── redis/                           # optional: provider/key builder Redis hoặc queue
└── events/                          # optional: event contract/handler của module
```

Quy tắc gốc module:

- File production ở gốc chỉ thuộc bộ file trên: facade, controller, module, errors,
  constants, `index.ts`.
- Unit test đặt cạnh file được test. Vì vậy `foo.service.spec.ts` hợp lệ ở gốc và
  `services/bar.service.spec.ts` hợp lệ trong `services/`.
- Integration test của cả module đặt ở gốc và có hậu tố `.integration.spec.ts`.
- Không tạo `events/`, `repositories/` hoặc bất kỳ folder nào chỉ để dành chỗ. Folder
  chỉ xuất hiện khi module thực sự có thành phần tương ứng.
- Nếu module không có HTTP inbound thì có thể bỏ controller. Nếu module không có
  persistence thì bỏ `entities/` và migration.

## 16.3 Chọn folder theo vai trò

| Thành phần                          | Folder          | Ranh giới                                                                                                       |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| DTO nhận/trả HTTP                   | `dto/`          | Class boundary, validation input, OpenAPI, serialization output                                                 |
| TypeORM entity và persistence model | `entities/`     | Sở hữu bởi module; không dùng làm public contract mặc định                                                      |
| Nghiệp vụ được tách khỏi facade     | `services/`     | Gọi qua DI, không trở thành API xuyên module mặc định                                                           |
| Custom query/data-access adapter    | `repositories/` | Chỉ tạo khi có query/persistence abstraction thực sự; CRUD TypeORM đơn giản có thể inject trực tiếp vào service |
| Boundary thay implementation        | `ports/`        | Abstract class/interface + token; implementation chọn qua DI/config                                             |
| API client bên thứ ba               | `clients/`      | Chỉ gọi API ngoài, không chứa business rule                                                                     |
| Job nền/worker/scheduler            | `jobs/`         | Lifecycle, retry, interval và idempotency của job                                                               |
| Webhook bên thứ ba                  | `webhooks/`     | Controller, signature verification và DTO webhook                                                               |
| Redis/queue provider riêng module   | `redis/`        | Provider, key builder và script thuộc store đó                                                                  |
| Event contract/handler              | `events/`       | Event versioning; DB write + publish dùng outbox khi cần                                                        |

`common/` chỉ dành cho hạ tầng trung lập dùng chung. Không chuyển nghiệp vụ của một
module vào `common/` chỉ để tránh import.

## 16.4 Public API và ownership

`index.ts` là cổng public duy nhất của module. Module khác chỉ import từ
`modules/<name>` hoặc `modules/<name>/index`, không import file nội bộ.

`index.ts` nên export tối thiểu:

- module class;
- facade service và input/output type dùng cho lời gọi DI;
- DTO/read model/port/event contract thật sự là hợp đồng public.

Không export mặc định TypeORM entity, repository, job, client hoặc helper nội bộ. Nếu
module khác cần entity để query trực tiếp, đó là dấu hiệu boundary chưa đúng: thêm public
method/read model hoặc contract phù hợp cho module sở hữu dữ liệu. Các entity đang được
export trong code cũ là compatibility debt; không mở rộng pattern này ở module mới.

`<module>.module.ts` chỉ export provider public tối thiểu tương ứng với contract đó.
Không export `Repository<T>` hoặc writer nội bộ của module.

## 16.5 Naming và vị trí type

- Mọi quy ước đặt tên theo [17-naming-conventions.md](./17-naming-conventions.md); mục này chỉ
  quy định vị trí và grouping type của module.
- File mới ưu tiên một DTO/entity mỗi file: `profile.dto.ts`, `user.entity.ts`.
- File nhóm các DTO/entity liên quan chặt chẽ (`profile.dtos.ts`, `iap.entities.ts`) chỉ
  dùng khi grouping giúp đọc code tốt hơn; không trộn hai quy ước tùy tiện trong cùng
  module. File legacy giữ nguyên cho tới khi có lý do sửa.
- Enum gắn với một entity có thể nằm trong entity file. Interface input/output của DI
  đặt cùng service định nghĩa nó và được export qua `index.ts` khi là public contract.
- Port/strategy cần đổi implementation qua config đặt trong `ports/`; client bên thứ ba
  thuần gọi API đặt trong `clients/`; không đặt cả hai ở gốc module.

## 16.6 Trình tự xây dựng module

1. Đọc `AGENTS.md`, context core, architecture và domain spec; xác định ownership,
   boundary, flow và acceptance criteria.
2. Nếu có tiền, realtime, state machine hoặc contention, chạy `review-module plan`.
3. Tạo root skeleton: `<module>.module.ts`, facade service nếu có behavior,
   controller nếu có HTTP, errors và `index.ts`.
4. Thêm đúng các folder optional theo vai trò thực tế; không scaffold folder trống.
5. Thêm entity/DTO/port/service/job/client/event theo nhu cầu, cùng migration mới nếu
   có schema thay đổi. Không sửa migration đã commit.
6. Viết unit test cạnh file nguồn; thêm integration test thật cho flow cần DB/concurrency.
7. Wiring `forFeature`, provider, public exports và đăng ký module trong `app.module.ts`.
8. Kiểm tra public API không làm lộ persistence nội bộ và module khác không import nội tạng.
9. Chạy các lệnh verify; với module nghiệp vụ, hoàn tất `review-module verify` trước khi
   báo xong.

## 16.7 Definition of Done cho cấu trúc

- Tất cả file nằm đúng root hoặc folder theo vai trò.
- Không có folder trống, abstraction để dành hoặc file root không thuộc allowlist.
- `index.ts` là public API duy nhất; `module.ts` export tối thiểu.
- DTO, entity, event và repository không bị dùng lẫn vai trò.
- Test đặt cạnh source; integration test đặt ở root module.
- Migration là file mới và có index theo query thực tế.
- `pnpm agent:check`, test áp dụng, lint/build và `review-module verify` đạt yêu cầu.

---

[← 15 · Commit Guidelines](./15-commit-guidelines.md) · [17 · Naming Conventions →](./17-naming-conventions.md)
