[← 14 · Rule Enforcement Matrix](./14-rule-enforcement-matrix.md) · **15 · Commit Guidelines**

# 15. Commit Guidelines — chuẩn commit dùng chung

Mỗi commit phải là một thay đổi có thể hiểu, review và rollback độc lập. Commit message là một
phần của lịch sử kỹ thuật; viết để người không có ngữ cảnh của ticket vẫn hiểu **đã đổi gì** và
**vì sao**.

## 15.1 Cú pháp bắt buộc

```text
<type>(<scope>): <mô tả ngắn ở thể mệnh lệnh>
```

- `type` bắt buộc, viết thường: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`,
  `ci`, `chore`, hoặc `revert`.
- `scope` bắt buộc: tên module/app/lib bị tác động chính, ví dụ `economy`, `matching`, `calling`,
  `party-room`, `auth`, `admin`, `web`, `api-client`, `infra`, `platform`, `docs`, `agent`.
- Mô tả viết ngắn, chủ động, không kết thúc bằng dấu chấm; dùng tiếng Việt hoặc tiếng Anh nhất
  quán trong từng commit. Không dùng thông điệp mơ hồ như `update`, `fix bug`, `wip`, `changes`.
- Breaking change thêm `!` ngay sau scope và giải thích migration/impact trong body hoặc PR:
  `feat(api-client)!: đổi cursor pagination sang opaque token`.

Ví dụ hợp lệ:

```text
feat(economy): thêm reversal cho chargeback IAP
fix(matching): khóa ticket trước khi xác nhận cặp
test(calling): cover race giữa billing tick và call end
docs(architecture): ghi rõ capacity boundary của LiveKit
ci(agent): chặn E2E pass khi không có test
```

## 15.2 Chọn type và scope

| Type       | Dùng khi                                                  |
| ---------- | --------------------------------------------------------- |
| `feat`     | Thêm năng lực quan sát được hoặc contract mới             |
| `fix`      | Sửa hành vi sai, race, security hoặc reliability defect   |
| `docs`     | Chỉ đổi tài liệu, không đổi runtime/CI behavior           |
| `refactor` | Đổi cấu trúc nội bộ nhưng giữ nguyên hành vi              |
| `test`     | Chỉ thêm/sửa test hoặc fixture                            |
| `perf`     | Cải thiện hiệu năng đã đo hoặc giảm chi phí có bằng chứng |
| `build`    | Dependency, build tool, packaging, generated artifact     |
| `ci`       | Pipeline, workflow, quality gate hoặc automation          |
| `chore`    | Bảo trì không thuộc nhóm trên                             |
| `revert`   | Hoàn tác một commit trước đó                              |

Nếu một commit vừa đổi runtime vừa thêm test/documentation cần thiết để chứng minh cùng thay đổi,
chọn type của thay đổi chính. Không tách test hoặc migration ra khỏi thay đổi mà chúng bảo vệ;
ngược lại, không gộp các feature độc lập chỉ để giảm số commit.

## 15.3 Nội dung commit tốt

- Giữ commit nhỏ và atomic: một intent, một acceptance criterion, không kèm reformat hay refactor
  không liên quan.
- Gồm code, test, migration, generated OpenAPI client và docs cần thiết trong **cùng commit** khi
  chúng tạo thành một contract. Migration đã commit là bất biến.
- Body dùng khi cần nêu lý do, risk, invariant, cách migrate/rollback hoặc ảnh hưởng API. Footer
  có thể tham chiếu issue/ADR theo quy ước của team, ví dụ `Refs: #123` hoặc `ADR: 0001`.
- Không commit secret, `.env` thật, token, receipt, database dump, log/coverage/dist tạm hoặc
  artefact chỉ sinh ở máy cá nhân.

## 15.4 Checklist trước khi tạo commit

1. Xem `git status` và `git diff --staged`; stage file tường minh, không dùng `git add .` nếu
   worktree còn thay đổi ngoài phạm vi.
2. Đã chạy gate theo scope: tối thiểu `pnpm agent:check`; code thay đổi chạy
   `pnpm agent:verify <scope>`. Flow Economy/Matching/Calling/Gift/Party Room/Feed/Trust & Safety
   phải có `review-module verify` theo `AGENTS.md`.
3. Khi đổi API, chạy `pnpm openapi:check`; khi đổi docs, để repository check xác minh link; khi
   đổi schema, dùng migration mới.
4. Đọc lại message theo § 15.1 và bảo đảm commit có thể rollback mà không để schema/code nửa vời.

Husky hiện chạy `pnpm agent:check -- --staged` và `lint-staged` trước commit. Đây là lớp bảo vệ
tối thiểu, **không** thay thế verification theo scope và hiện chưa tự kiểm format commit message;
người tạo commit chịu trách nhiệm theo file này.

## 15.5 Quy trình tham chiếu

```bash
git status --short
git diff -- path/to/file
git add path/to/file-a path/to/file-b
git diff --staged --check
pnpm agent:check
git commit -m "fix(economy): giữ tuần tự query trong ledger transaction"
```

Không dùng `--no-verify` để vượt hook. Nếu hook/gate sai, sửa nguyên nhân hoặc cập nhật rule
canonical cùng thay đổi; không hạ chuẩn chỉ để commit qua.

---

[← 14 · Rule Enforcement Matrix](./14-rule-enforcement-matrix.md) · [00 · Mục lục →](./00-overview-and-index.md)
