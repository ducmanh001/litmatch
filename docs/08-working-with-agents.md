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

Output chia hai mức: **Read first** là context tối thiểu bắt buộc; **Read when applicable** chỉ
đọc khi điều kiện sau dấu `—` khớp task. Cách này tránh nạp checklist/spec không liên quan nhưng
không được dùng để bỏ qua tài liệu domain khi điều kiện đã khớp.

Scope chuẩn: `core`, `economy`, `matching`, `calling`, `signaling`, `content`, `media`, `frontend`,
`infra`.

## 8.3 Skills dùng chung

- Task code, review, điều tra hoặc thiết kế không tầm thường: dùng
  `.agents/skills/adaptive-orchestration/SKILL.md` để route theo complexity/risk. Router ưu tiên
  direct cho task nhỏ, model cost-balanced cho workstream độc lập và chỉ nâng model mạnh cho
  critical review/conflict.
- Bắt đầu module/domain mới: `.agents/skills/new-module/SKILL.md`.
- Plan trước code và verify trước bàn giao: `.agents/skills/review-module/SKILL.md`.

Môi trường có cơ chế gọi skill riêng có thể expose shortcut, nhưng canonical instruction luôn
nằm trong `.agents/skills/`.

Trong repo này, người dùng chỉ cần gửi yêu cầu bình thường; `AGENTS.md` yêu cầu agent tự route mọi
task không tầm thường. Khi muốn ép routing tường minh hoặc dùng skill ngoài repo, dùng một prompt:

```text
Dùng $adaptive-orchestration xử lý yêu cầu sau: <yêu cầu>. Tự đánh giá complexity, chọn model và
sub-agent phù hợp; ưu tiên giảm token nhưng giữ nguyên acceptance criteria và quality gates của repo.
```

Model cụ thể phụ thuộc runtime. Agent không được đoán model ID hoặc tuyên bố đã đổi model của lượt
đang chạy; nếu runtime không hỗ trợ override thì dùng model kế thừa và vẫn giữ các quality gate.

## 8.4 Guard độc lập công cụ

`scripts/agent/guard-core.mjs` chứa rule thuần và có unit test. Hai adapter dùng chung rule:

- Pre-tool adapter chặn hành động nguy hiểm ngay lúc agent thao tác.
- Repository checker scan diff trong local/CI, nên code từ bất kỳ agent hoặc con người đều chịu
  cùng guardrail.

Các luật cứng hiện tại: app deploy thứ tư, `synchronize: true`, sửa/xoá migration đã commit,
mutate `ledger_entries` ngoài test, E2E cho phép pass khi không có test, và các boundary FE được
liệt kê trong [14-rule-enforcement-matrix.md](./14-rule-enforcement-matrix.md).

## 8.5 Vòng lặp mặc định

1. Đọc `AGENTS.md` root + file theo scope.
2. Chạy `pnpm agent:context <scope>`.
3. Với luồng nghiệp vụ mới, chạy `review-module plan`.
4. Viết test song song, thay đổi từng lát nhỏ.
5. Chạy `pnpm agent:check`, unit test file/target bị ảnh hưởng, lint/build target áp dụng.
6. Trước khi push/cập nhật PR, chạy một local gate bằng `pnpm ci:preflight`; hook `pre-push`
   luôn chạy thêm clean quality gate trong Node 22 Linux với dependency cài từ lockfile mới.
7. Với business flow nhạy cảm, chạy `review-module verify`; FAIL thì sửa và verify lại. Với
   docs/tooling không chạm business flow, ghi `review-module: N/A` có lý do.
8. Bàn giao bằng chứng, không chỉ nói “đã xong”.

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

## 8.8 Eval golden-bugs — 2 tầng, chỉ tầng 1 nằm trong CI

`scripts/agent/golden-bugs/*.json` là thư viện lỗi nghiệp vụ thật khớp `docs/10 § 10.2`.

- **Tầng 1 (tool, miễn phí, chạy trong `pnpm agent:test`)**: fixture còn parse được, đủ field,
  `docsRef` còn khớp nguyên văn docs/10, mỗi module đã có ≥1 fixture. Đây chỉ đảm bảo _thư viện
  câu hỏi_ còn nguyên vẹn, KHÔNG đo được agent review có thực sự bắt bug hay không.
- **Tầng 2 (AI, có chi phí LLM thật, KHÔNG nằm trong CI/agent:test)**: đo agent review có bắt
  được từng fixture không. Quy trình: `node scripts/agent/golden-bugs-eval-prep.mjs [--module=X]`
  in prompt review MÙ (chỉ `buggyCode`, không lộ `whyWrong`/`description`) — giao mỗi fixture
  cho 1 Agent call riêng, rồi tự so câu trả lời với `whyWrong` của đúng fixture đó để chấm.
  Chạy tay khi: đổi đáng kể phương pháp luận `docs/10 § 10.0`, hoặc định kỳ (khuyến nghị hàng
  quý) để phát hiện review chất lượng có tụt theo thời gian không. Không tự động hoá thành cron
  mặc định — chi phí token định kỳ là quyết định người dùng phải bật rõ ràng (skill `/schedule`),
  không phải hạ tầng agent tự ý bật.

## 8.9 Execution budget

Mọi agent tuân theo giới hạn ở `AGENTS.md` và `adaptive-orchestration`: không polling/sleep loop,
không progress filler, log/context theo bounded range, tối đa hai retry cho cùng failure và unit
test theo file/target bị ảnh hưởng. Full test suite chỉ chạy khi người dùng yêu cầu rõ; gate riêng
của domain nhạy cảm vẫn bắt buộc. Sub-agent cap hai; agent phải dừng delegate khi đã đủ evidence
thay vì để chạy nền không cần thiết.

---

[← 07 · Roadmap](./07-roadmap.md) · [09 · Practical Notes →](./09-practical-notes.md)
