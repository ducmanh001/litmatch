# 18. Documentation architecture, evidence và automation

Tài liệu là một system có ownership và lifecycle, không phải tập file Markdown ngang hàng. Mục
tiêu là người đọc tìm được đúng nguồn, biết mức độ bằng chứng và phát hiện drift bằng máy ở phần có
thể deterministic.

## 18.1 Taxonomy và owner

| Loại tài liệu             | Owner của sự thật                                               | Lifecycle                               | Ví dụ                                       |
| ------------------------- | --------------------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| Repository contract       | Invariant/quy trình bắt buộc toàn repo                          | Cập nhật cùng guard/check liên quan     | `/AGENTS.md`                                |
| Product intent            | Capability và boundary sản phẩm                                 | Thay khi product decision đổi           | `01-product-features.md`                    |
| Current architecture/rule | Topology, ownership, domain behavior hiện hành                  | Cập nhật cùng code/ADR/migration        | `03`, `06`, `docs/services/`                |
| Decision history          | Bối cảnh, lựa chọn, hệ quả của quyết định bền vững              | Append/supersede, không rewrite lịch sử | `docs/adr/`                                 |
| Delivery roadmap          | Work tiếp theo và trigger mở khóa                               | Giữ ngắn; không copy current status     | `07-roadmap.md`                             |
| Procedure/runbook         | Bước thao tác cho một profile, precondition, rollback và verify | Test lại khi command/profile đổi        | `docs/runbooks/`                            |
| Historical evidence       | Plan/review/check tại một thời điểm                             | Giữ ngày/caveat; link canonical owner   | `docs/plans/`                               |
| Machine-readable contract | Contract/status có schema và validator                          | Generate/check deterministic            | OpenAPI, Arazzo, AsyncAPI, feature registry |
| Generated projection      | View cho người đọc hoặc DOCX                                    | Không sửa tay; regenerate từ source     | `docs/generated/`                           |
| Visual reference          | Ý tưởng presentation                                            | Không được ghi đè API/domain behavior   | `layouts/`                                  |

Một thay đổi có thể chạm nhiều loại, nhưng mỗi fact chỉ có một owner. Ví dụ: intent “có top-up” ở
01; protocol ở OpenAPI; ledger behavior ở Economy spec; runtime readiness ở `/capabilities`;
production enablement ở release evidence. Không copy một câu “đã xong” vào cả năm nơi.

## 18.2 Thứ tự giải quyết conflict

1. `/AGENTS.md` và invariant dữ liệu/bảo mật.
2. Architecture hiện hành + ADR accepted/superseding.
3. Domain rules + service/module spec + machine-readable contract.
4. Coding standards/local instructions/enforcement matrix.
5. Runbook cho đúng profile.
6. Roadmap, plan/review, generated report, mockup và source tham khảo.

Nếu canonical prose mâu thuẫn code/test hiện hành, không mặc định code luôn đúng. Xác định thay đổi
nào được approve, sửa source canonical hoặc implementation trong cùng scope và ghi evidence. Dated
plan không được dùng để “thắng” rule mới hơn.

## 18.3 Evidence và status vocabulary

| Thuật ngữ               | Nghĩa được phép                                                           |
| ----------------------- | ------------------------------------------------------------------------- |
| `implemented`           | Evidence source được registry khai báo tồn tại trong checkout.            |
| `automated-test-source` | Có test source liên quan; không khẳng định test vừa chạy/PASS.            |
| `recordedChecks`        | Kết quả được ghi ở một handoff có ngày và caveat; là historical evidence. |
| Local PASS              | Command nêu rõ đã PASS trên checkout/môi trường cục bộ đó.                |
| Production verified     | Có artifact/runtime evidence, time window, version/SHA và owner phù hợp.  |
| Deferred                | Cố ý chưa làm; phải nêu reason/trigger/owner khi biết.                    |
| Inferred risk           | Failure mode hợp lý nhưng chưa được quan sát như incident.                |

Không gọi lỗi test/design correction là production incident nếu không có primary incident record.
Không dùng file tồn tại, mock, screenshot hay generated report để nâng mức bằng chứng.

`docs/feature-registry.json` là index máy đọc được của capability code-backed. Product intent vẫn ở
01; architecture/domain behavior vẫn ở 03/06/service specs; REST/realtime contracts vẫn ở
`openapi/core-api.json`, `specs/critical-workflows.arazzo.yaml` và
`specs/realtime.asyncapi.yaml`.

## 18.4 Generate và validate

```bash
pnpm docs:generate
pnpm docs:check
# Recovery-only khi registry evidence ngoài scope đang stale:
pnpm docs:generate --docx-only
```

Generator validate evidence path/text marker, Arazzo bằng vendored official schema, AsyncAPI bằng
official parser và tạo:

- `docs/generated/product-spec-evidence-report.md`
- `docs/generated/product-spec-evidence-report.docx`
- `docs/generated/ai-native-handbook.docx`

Output deterministic với input cố định: metadata, thứ tự entry và XML/DOCX normalized. `docs:check`
kiểm tra report stale, ZIP/XML entry và navigation index. `--docx-only` chỉ là recovery projection;
nó không validate registry/spec và không thay một lần `pnpm docs:check` đầy đủ.

Vendored Arazzo schema ở `scripts/docs/schemas/arazzo-1.1-2026-04-15.json` giữ upstream schema ID/
revision. Nâng schema/parser là source change phải review, không fetch ngầm trong generator.

## 18.5 Documentation Definition of Done

Một thay đổi docs hoàn tất khi:

1. Fact nằm đúng owner, không copy status sang projection khác.
2. Link tương đối/anchor/catalog resolve; directory entry mới có landing index.
3. Claim implementation có source evidence; claim production có operational evidence/caveat.
4. Deferred item có reason/trigger; decision bền vững có ADR khi cần.
5. Command/env/path lấy từ package/config/source hiện hành, không dựa trí nhớ.
6. Generated artifact được regenerate, không sửa tay.
7. Chạy `pnpm docs:check`, `pnpm agent:check` và format check áp dụng. Với shared worktree, ưu tiên
   targeted formatter/check; không chạy formatter ghi toàn repo khi có edit của người khác.
8. Handoff nêu file, checks, assumptions, open risks và `review-module` result hoặc lý do N/A.

Navigation test còn enforce catalog `docs/services/README.md` phải nhắc mọi top-level Core API
module, kể cả module chưa cần standalone spec. Mục tiêu là phát hiện coverage gap, không ép mỗi
module tạo thêm một file.

## 18.6 Kỹ thuật và đánh đổi

- **Single source of truth theo responsibility:** giảm semantic drift; đánh đổi là người đọc phải
  đi theo link thay vì có mọi chi tiết trong một README.
- **Progressive disclosure:** root/index/roadmap ngắn, detail nằm gần owner; thêm landing page nhỏ
  nhưng giảm context và chi phí bảo trì.
- **Docs as code:** schema, deterministic generator, link/catalog tests và source marker bắt drift
  có cấu trúc; vẫn cần review tay cho semantic/business correctness.
- **Evidence ladder:** tách source, test source, recorded PASS và production verification; câu chữ
  dài hơn một chút nhưng không bán quá mức readiness.
- **Append/supersede history:** ADR/plan giữ traceability; canonical docs chỉ giữ trạng thái hiện
  hành để không bắt newcomer đọc changelog dài.
- **Trigger-based roadmap:** không gán threshold/ngày theo đoán; đánh đổi là một số item không có
  deadline cho tới khi có dữ liệu/authority thật.

`review-module: N/A` — tài liệu này định nghĩa documentation/tooling boundary, không thay đổi
business flow.
