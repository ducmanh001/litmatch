[← 07 · Roadmap](./07-roadmap.md) · **08 · Working with Agents** · [09 · Practical Notes →](./09-practical-notes.md)

# 8. Cách agent làm việc trong repo

`/AGENTS.md` là hợp đồng hành vi duy nhất. File theo scope như `apps/core-api/AGENTS.md`
chỉ bổ sung boundary địa phương; adapter auto-discovery không được chứa luật riêng.

## 8.1 Task contract

Trước khi sửa, agent phải xác định ngắn gọn:

```markdown
Objective:
Out of scope:
Acceptance criteria:
Context scope:
Risk/invariants:
Required checks:
```

Nếu thiếu thông tin nhưng có thể suy luận an toàn trong scope, ghi rõ assumption và tiếp tục.
Nếu lựa chọn làm thay đổi đáng kể kết quả hoặc authority, dừng để hỏi.

## 8.2 Context theo nhu cầu

Không nạp toàn bộ repo theo thói quen. Chạy `pnpm agent:context <scope>` để lấy đúng docs,
boundary và test bắt buộc. Context map nằm ở `.agents/context-map.json` và được validate trong
`pnpm agent:check` để đường dẫn không bị stale.

Scope chuẩn: `core`, `economy`, `matching`, `signaling`, `media`, `infra`.

## 8.3 Skills dùng chung

- Bắt đầu module/domain mới: `.agents/skills/new-module/SKILL.md`.
- Plan trước code và verify trước bàn giao: `.agents/skills/review-module/SKILL.md`.

Môi trường có cơ chế gọi skill riêng có thể expose shortcut, nhưng canonical instruction luôn
nằm trong `.agents/skills/`.

## 8.4 Guard độc lập công cụ

`scripts/agent/guard-core.mjs` chứa rule thuần và có unit test. Hai adapter dùng chung rule:

- Pre-tool adapter chặn hành động nguy hiểm ngay lúc agent thao tác.
- Repository checker scan diff trong local/CI, nên code từ bất kỳ agent hoặc con người đều chịu
  cùng guardrail.

Các luật cứng hiện tại: app deploy thứ tư, `synchronize: true`, sửa/xoá migration đã commit,
và mutate `ledger_entries` ngoài test.

## 8.5 Vòng lặp mặc định

1. Đọc `AGENTS.md` root + file theo scope.
2. Chạy `pnpm agent:context <scope>`.
3. Với luồng nghiệp vụ mới, chạy `review-module plan`.
4. Viết test song song, thay đổi từng lát nhỏ.
5. Chạy `pnpm agent:check`, test áp dụng, lint, build.
6. Chạy `review-module verify`; FAIL thì sửa và verify lại.
7. Bàn giao bằng chứng, không chỉ nói “đã xong”.

## 8.6 Handoff contract

Mọi bàn giao phải có:

```markdown
Outcome:
Files changed:
Commands and results:
Assumptions/decisions:
Open risks or follow-ups:
Review verdict:
```

Không lưu suy luận nội bộ, toàn bộ prompt, token, secret hoặc dữ liệu người dùng vào repo.

## 8.7 Thay đổi hạ tầng agent

Prompt, contract, context map, guard và skill được coi là code:

- Một nguồn sự thật, không copy-paste theo công cụ.
- Script phải có test deterministic.
- Skill phải pass validator.
- Thay đổi rule cần thêm positive case và negative case.
- CI phải chạy `pnpm agent:check` và `pnpm agent:test`.

---

[← 07 · Roadmap](./07-roadmap.md) · [09 · Practical Notes →](./09-practical-notes.md)
