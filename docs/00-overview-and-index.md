# 00. Tổng quan và bản đồ tài liệu

Đây là điểm vào chính của tài liệu Litmatch. Đọc `/AGENTS.md` trước khi thay đổi repository; dùng
file này để tìm đúng **owner của sự thật**, không nạp mọi tài liệu như thể chúng có cùng thẩm
quyền.

## 00.1 Cách đọc trạng thái cho đúng

| Câu hỏi                                   | Nguồn cần đọc                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Sản phẩm muốn có capability nào?          | [01 · Product capabilities](./01-product-features.md)                                                                 |
| Checkout này có source/test evidence gì?  | [`feature-registry.json`](./feature-registry.json) và [report được sinh](./generated/product-spec-evidence-report.md) |
| Kiến trúc/rule hiện hành là gì?           | [03 · Architecture](./03-architecture.md), [06 · Domain rules](./06-domain-rules.md), `docs/services/` và ADR         |
| Việc gì đang chờ và điều kiện mở khóa?    | [07 · Roadmap](./07-roadmap.md)                                                                                       |
| Một thay đổi cũ đã làm/kiểm tra những gì? | [Plans and reviews](./plans/README.md); đây chỉ là bằng chứng lịch sử                                                 |
| Release hoặc xử lý sự cố bằng cách nào?   | [Runbooks](./runbooks/README.md) và [19 · Project lifecycle](./19-project-lifecycle-and-learning.md)                  |

`implemented` chỉ có nghĩa evidence được khai báo đang tồn tại trong repository. Test source
không chứng minh test vừa chạy; local PASS không chứng minh production; roadmap không phải registry
trạng thái. Chạy `pnpm docs:check` trước khi dựa vào report được sinh.

## 00.2 Thứ tự thẩm quyền

Khi nguồn mâu thuẫn, dừng và sửa owner canonical trong cùng thay đổi:

1. `/AGENTS.md` giữ ba invariant toàn repository.
2. Architecture hiện hành và ADR giữ boundary/quyết định bền vững.
3. Domain rules và service/module spec giữ hành vi nghiệp vụ.
4. Coding standards, enforcement matrix và local `AGENTS.md` giữ quy tắc thực thi theo scope.
5. Runbook giữ thủ tục vận hành cho một profile đã nêu rõ.
6. Roadmap, plan/review, generated report và mockup là projection/evidence; chúng không được ghi đè
   các nguồn trên.

Chi tiết về taxonomy, ownership và cách cập nhật nằm ở
[18 · Documentation architecture](./18-documentation-automation.md).

## 00.3 Lộ trình đọc theo vai trò

- **Người mới:** `/AGENTS.md` → file này → [19 · Lifecycle](./19-project-lifecycle-and-learning.md)
  → [03 · Architecture](./03-architecture.md) → spec của scope đang làm.
- **Product/domain:** [01 · Capabilities](./01-product-features.md) →
  [02 · Domain model](./02-domain-model.md) → [06 · Domain rules](./06-domain-rules.md) →
  [service catalog](./services/README.md).
- **Backend:** 03 → [04 · Tech stack](./04-tech-stack.md) →
  [05 · Coding standards](./05-coding-standards.md) →
  [16 · Module blueprint](./16-module-blueprint.md) → service spec.
- **Frontend:** [12 · Frontend architecture](./12-frontend-architecture.md) →
  [13 · Frontend standards](./13-frontend-coding-standards.md) → OpenAPI/runtime capability
  contract.
- **Review/release:** [10 · Review checklist](./10-code-review-checklist.md) →
  [14 · Enforcement matrix](./14-rule-enforcement-matrix.md) →
  [15 · Commit guidelines](./15-commit-guidelines.md) → runbook áp dụng.
- **Agent/AI-native:** [08 · Working with agents](./08-working-with-agents.md) →
  [20 · AI-native handbook](./20-ai-native-handbook.md), rồi chạy `pnpm agent:context <scope>`.

## 00.4 Catalog canonical theo trách nhiệm

| Mục | Tài liệu                                                                 | Trách nhiệm duy nhất                                          |
| --: | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
|  01 | [Product capabilities](./01-product-features.md)                         | Intent và boundary sản phẩm; không giữ trạng thái triển khai  |
|  02 | [Domain model](./02-domain-model.md)                                     | Bản đồ aggregate/entity và quan hệ ownership                  |
|  03 | [Architecture](./03-architecture.md)                                     | Topology, dependency direction và tiêu chí tách deployable    |
|  04 | [Tech stack](./04-tech-stack.md)                                         | Lựa chọn công nghệ hiện hành                                  |
|  05 | [Backend coding standards](./05-coding-standards.md)                     | Convention NestJS/API/persistence/test                        |
|  06 | [Domain rules](./06-domain-rules.md)                                     | Invariant nghiệp vụ xuyên module                              |
|  07 | [Roadmap](./07-roadmap.md)                                               | Trình tự, khoảng trống và trigger mở khóa công việc tương lai |
|  08 | [Working with agents](./08-working-with-agents.md)                       | Task contract, context, skill, handoff và execution budget    |
|  09 | [Practical notes](./09-practical-notes.md)                               | Gotcha ngắn dùng lại trong thực tế                            |
|  10 | [Code review checklist](./10-code-review-checklist.md)                   | Phương pháp tìm lỗi logic và checklist domain                 |
|  11 | [Engineering principles](./11-engineering-principles.md)                 | La bàn ownership, coupling, correctness và operability        |
|  12 | [Frontend architecture](./12-frontend-architecture.md)                   | Boundary của Admin/Web và hợp đồng backend                    |
|  13 | [Frontend coding standards](./13-frontend-coding-standards.md)           | Convention TypeScript, state, UX, realtime và test            |
|  14 | [Rule enforcement matrix](./14-rule-enforcement-matrix.md)               | Rule → guard/test → owner; không tạo rule mới                 |
|  15 | [Commit guidelines](./15-commit-guidelines.md)                           | Commit scope, message và verification                         |
|  16 | [Module blueprint](./16-module-blueprint.md)                             | Skeleton/DoD cho module NestJS                                |
|  17 | [Naming conventions](./17-naming-conventions.md)                         | Quy ước định danh xuyên code/API/DB/event                     |
|  18 | [Documentation architecture](./18-documentation-automation.md)           | Taxonomy, evidence vocabulary, generation và docs DoD         |
|  19 | [Project lifecycle and learning](./19-project-lifecycle-and-learning.md) | Discover → deprecate, error/incident và lesson lifecycle      |
|  20 | [AI-native handbook](./20-ai-native-handbook.md)                         | Prompt/context/harness/eval và trigger áp dụng công nghệ      |

## 00.5 Catalog theo loại artifact

| Directory                          | Dùng khi                                                    | Không dùng để                              |
| ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| [Services](./services/README.md)   | Đọc đặc tả boundary của module/domain                       | Suy ra có thêm deployable                  |
| [ADRs](./adr/README.md)            | Hiểu quyết định đã chốt, phương án loại và hệ quả           | Mô tả trạng thái runtime hiện tại một mình |
| [Runbooks](./runbooks/README.md)   | Thực hiện local/release/observability/recovery theo profile | Tuyên bố SLA hoặc production PASS          |
| [Plans/reviews](./plans/README.md) | Tra assumptions, review và kết quả tại một thời điểm        | Ghi đè rule hiện hành                      |
| [Reference](./reference/README.md) | Tra registry, handoff và bài học có link về nguồn gốc       | Copy lại toàn bộ domain spec               |
| [Templates](./templates/README.md) | Tạo record có cấu trúc                                      | Xem field trống là evidence                |

Contract máy đọc được nằm ở [`openapi/`](../openapi/README.md) và
[`specs/`](../specs/README.md). Tài liệu vận hành repository nằm gần artifact:
[`deploy/`](../deploy/README.md), [`k8s/`](../k8s/README.md),
[`loadtest/`](../loadtest/README.md), [`scripts/`](../scripts/README.md) và
[`layouts/`](../layouts/README.md). [Nguồn tham khảo](./sources.md) chỉ hỗ trợ reasoning; code,
test, ADR và evidence vận hành mới chứng minh hệ thống này.

## 00.6 Quy ước khi sửa tài liệu

- Giữ số mục/anchor cũ khi có tham chiếu; mục mới thêm tiếp, không đánh lại lịch sử.
- Sửa đúng owner canonical và tất cả projection bị ảnh hưởng trong cùng commit.
- Không copy status thủ công vào nhiều README; link registry/report hoặc source evidence.
- Tách file khi một chủ đề có owner/lifecycle khác, không chỉ vì file dài.
- Ghi rõ fact, historical evidence, inferred risk, deferred work và production verification.
- Sau thay đổi docs chạy `pnpm docs:check`, `pnpm agent:check` và format check theo scope. Thay đổi
  business nhạy cảm vẫn phải qua `review-module`; docs-only ghi `review-module: N/A` kèm lý do.

---

[Tiếp: 01 · Product capabilities →](./01-product-features.md)
