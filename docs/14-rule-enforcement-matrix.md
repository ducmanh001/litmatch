[← 13 · Frontend Coding Standards](./13-frontend-coding-standards.md) · **14 · Rule Enforcement Matrix**

# 14. Rule Enforcement Matrix — luật nào được chặn ở đâu

File này không tạo luật mới. Nó nối nguồn canonical với enforcement/test hiện có để reviewer
không nhầm “đã viết trong docs” với “đã được máy chứng minh”. Khi thêm hoặc đổi invariant, cập
nhật đúng một dòng trong bảng cùng PR.

| Invariant / contract                              | Nguồn canonical                       | Enforcement                                                   | Bằng chứng                                    | Owner role             |
| ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------- | --------------------------------------------- | ---------------------- |
| Baseline chỉ ba backend deployable                | `AGENTS.md` luật 1, docs/03 § 3.2–3.4 | `guard-core` + repository diff + ADR bắt buộc để đổi baseline | `guard-core.test.mjs`                         | Architecture/platform  |
| Ledger append-only; sửa bằng reversal             | `AGENTS.md` luật 2, docs/03 § 3.8.C   | DB trigger + guard scan mutation                              | migration Economy + integration/property test | Economy                |
| Idempotency unique trên Transaction               | docs/05 § 5.10, Economy spec          | DB unique + transaction/lock                                  | Economy integration + HTTP E2E replay         | Economy                |
| Migration đã commit bất biến; cấm synchronize     | AGENTS + docs/04/05                   | pre-tool guard + diff guard                                   | guard positive/negative tests                 | Platform/data          |
| Module chỉ qua public API                         | docs/11 § 11.1, docs/05 § 5.3         | core module-boundary spec + Nx lint                           | `module-boundaries.spec.ts`                   | Core/domain            |
| FE không import backend/app khác                  | docs/12 § 12.9, docs/13 § 13.2        | Nx tag boundary + guard regex                                 | lint + guard tests                            | Frontend               |
| FE REST chỉ qua generated api-client              | docs/12 § 12.3                        | guard fetch/axios + OpenAPI drift check                       | `openapi:check`, api-client tests             | Frontend/API           |
| Env chỉ qua module typed/validated                | docs/05 § 5.2, docs/13 § 13.10        | compile type + Joi/Zod; FE guard                              | env validation tests + lint                   | App owner              |
| E2E phải có test và fail nhanh khi app không boot | docs/05 § 5.9                         | Nx inferred target, không `passWithNoTests`, startup timeout  | core/signaling E2E                            | Platform + app owner   |
| Sensitive flow có assumption table + verify       | AGENTS luật 3, docs/10 § 10.0         | PR template + `review-module`; manual reviewer gate           | output verify kèm `file:line`                 | Feature owner/reviewer |
| Docs relative link không stale                    | docs/00 quy ước docs sống             | repository check trên toàn bộ Markdown                        | `markdown-links.test.mjs`                     | Docs owner             |
| Coverage service là ratchet                       | docs/05 § 5.9                         | Jest threshold trong CI                                       | coverage report/artifact                      | Core owner             |
| Secret/PII không vào source/log/image             | docs/05 § 5.7–5.8, Security policy    | logger redact, Gitleaks, CodeQL, Trivy, audit                 | security workflow                             | Security/platform      |

## 14.1 Những việc cố ý vẫn là review tay

- Đúng/sai của business rule và assumption xuyên endpoint: checklist § 10.0 + reviewer hiểu
  domain; golden-bug tầng AI chỉ chạy khi có chủ đích vì có chi phí.
- Semantic drift giữa prose và code: link/path được máy kiểm, nhưng trạng thái như “đã làm/chưa
  làm” phải được feature owner cập nhật trong cùng PR.
- Quyết định scale/tách service: cần số liệu vận hành + ADR; không thể encode thành regex.
- Store/LiveKit sandbox, privacy/compliance và launch gate: cần bằng chứng môi trường thật.

## 14.2 Quy tắc thay đổi enforcement

1. Rule cứng mới cần positive case + negative case deterministic.
2. Rule không thể enforce bằng máy phải ghi rõ `manual` và nơi reviewer ký nhận.
3. Không dùng guard regex để giả vờ chứng minh business correctness; invariant dữ liệu ưu tiên DB
   constraint/transaction/test thật.
4. Gate fail thì sửa nguyên nhân hoặc cập nhật quyết định canonical; không hạ threshold/bypass.

---

[← 13 · Frontend Coding Standards](./13-frontend-coding-standards.md) · [00 · Mục lục →](./00-overview-and-index.md)
