[← 19 · Project lifecycle](./19-project-lifecycle-and-learning.md) · **20 · AI-native handbook** · [00 · Overview →](./00-overview-and-index.md)

# 20. AI-native engineering handbook

Tài liệu này giải thích cách Litmatch tổ chức repository để **con người và coding agent cùng hiểu,
thay đổi và kiểm chứng hệ thống an toàn**. Đây là lớp định hướng và lý do thiết kế; quy tắc bắt buộc
vẫn thuộc về [`/AGENTS.md`](../AGENTS.md), architecture/ADR, coding standards và service spec.

> **Ranh giới quan trọng:** “AI-native” ở đây mô tả quy trình engineering. Nó không khẳng định
> Litmatch đang có tính năng generative AI cho end user, một model tự host, RAG, fine-tuning hay
> LangChain/LangGraph trong production.

Bản phát hành dễ chia sẻ: [AI-native handbook (DOCX)](./generated/ai-native-handbook.docx). DOCX
được sinh deterministic từ chính file Markdown này; không sửa artifact bằng tay.

## 20.1 Đọc nhanh trong 10 phút

### Nếu bạn là người mới

1. Đọc ba invariant trong [`/AGENTS.md`](../AGENTS.md).
2. Đọc § 20.2 để hiểu kiến trúc AI-native, sau đó xem ma trận § 20.4 để biết cái gì thật sự đã có.
3. Mở [00 · Overview](./00-overview-and-index.md) và [03 · Architecture](./03-architecture.md) để
   định vị sản phẩm; không dùng handbook này thay cho domain spec.
4. Chọn scope bằng `pnpm agent:context <scope>`. Sửa agent harness, prompt, skill hoặc eval thì dùng
   `pnpm agent:context agents`.
5. Trước khi bàn giao, chạy checks do context command in ra và ghi lại kết quả thật.

### Nếu bạn là agent bắt đầu một task

1. Viết task contract: objective, out of scope, acceptance criteria, scope, risk/invariant, checks.
2. Kiểm tra worktree và coi mọi thay đổi có sẵn là của người khác cho tới khi có bằng chứng ngược lại.
3. Chạy `pnpm agent:context <scope>`; chỉ đọc thêm mục **Read when applicable** khi điều kiện khớp.
4. Với task không tầm thường, route qua `adaptive-orchestration`; chỉ delegate workstream độc lập.
5. Sửa lát nhỏ, thêm test cùng thay đổi, chạy gate theo scope và handoff bằng evidence.

Chi tiết thao tác nằm ở [08 · Working with agents](./08-working-with-agents.md); vòng đời thay đổi,
lỗi và bài học nằm ở [19 · Project lifecycle](./19-project-lifecycle-and-learning.md).

## 20.2 Kiến trúc AI-native của Litmatch

```text
Ý định người dùng
  → task contract và authority
  → router chọn cách làm/model/sub-agent
  → context đúng scope, nạp just-in-time
  → tool đọc/sửa/chạy check
  → guard chặn invariant độc lập với model
  → test + review + eval theo mức rủi ro
  → handoff có evidence
  → lesson/canonical doc khi có điều cần học bền vững
```

Kiến trúc có năm lớp, mỗi lớp xử lý một loại sai khác:

1. **Prompt engineering** làm rõ mục tiêu, ranh giới, vai trò, output và tiêu chí thành công.
2. **Context engineering** chọn đúng luật, code, tool và bằng chứng tại đúng thời điểm.
3. **Harness engineering** bao agent bằng router, skill, guard, hook, CI và execution budget.
4. **Verification/evals** đo kết quả bằng test, invariant và fixture thay vì tin lời tự kết luận.
5. **Durable learning** đưa bài học đã kiểm chứng về repo để phiên sau không phụ thuộc trí nhớ chat.

Mỗi lớp bổ sung cho lớp trước; prompt tốt không thay thế guard, model mạnh không thay thế test, và
nhiều context không tự động tạo ra hiểu biết đúng.

### Lợi ích cho Litmatch và cách đo

| Lợi ích                       | Cơ chế tạo lợi ích                                                                                       | Signal nên theo dõi                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Người mới hiểu nhanh hơn      | Một entry point ngắn, overview, handbook và context theo scope thay cho truyền miệng hoặc đọc toàn repo. | Thời gian từ clone tới targeted check đầu tiên PASS; số lần phải hỏi lại scope/owner.             |
| Ít lỗi invariant hơn          | Guard deterministic + service spec + review-module chặn sai ở nhiều lớp.                                 | Finding theo loại guard/review; lỗi lọt qua PR; tỷ lệ correction lặp lại.                         |
| Giảm token và thời gian agent | Progressive disclosure, bounded output, model routing và chỉ delegate nhánh độc lập.                     | Token/chi phí và lead time theo loại task; số tool call/file đọc không liên quan.                 |
| Handoff đáng tin hơn          | Kết quả gắn file, command, test, assumption và risk thay cho claim tự do.                                | Tỷ lệ handoff đủ evidence; rework do thiếu context hoặc acceptance không rõ.                      |
| Ít phụ thuộc model/provider   | Luật và tri thức nằm trong repo, guard/test chạy độc lập với LLM.                                        | Cùng eval chạy được trên runtime/model khác; số rule chỉ tồn tại trong prompt vendor-specific.    |
| Bài học không mất qua phiên   | Canonical docs, lesson record và guard/test giữ correction đã kiểm chứng.                                | Near-miss tái diễn; thời gian tìm root cause tương tự; lesson có owner/verification còn hiệu lực. |

Đây là **lợi ích kỳ vọng**, không phải số liệu production đã được chứng minh. Chỉ công bố mức cải
thiện sau khi có baseline, cùng tập task/eval và chi phí đo nhất quán.

## 20.3 Từ điển để không nhầm thuật ngữ

- **Prompt engineering:** thiết kế instruction, ví dụ, role, output contract và success criteria
  cho một lần hoặc một chuỗi gọi model.
- **Context engineering:** chọn và duy trì toàn bộ thông tin model nhìn thấy: system instruction,
  file, tool, history, evidence và dữ liệu truy xuất. Prompt chỉ là một phần của context.
- **Agent harness/scaffold:** phần mềm và policy bao quanh model để lập kế hoạch, gọi tool, quản lý
  context, delegate, kiểm soát quyền và trả kết quả.
- **Agent runtime:** môi trường thực thi agent; có thể cung cấp persistence, retry, streaming và
  human-in-the-loop. Harness và runtime không đồng nghĩa với model.
- **Eval:** task + môi trường + grader dùng để đo hành vi của model và harness. Unit test của code
  sản phẩm không tự động là eval chất lượng agent.
- **Few-shot:** đưa một số ví dụ canonical vào context. **Multi-turn** là tương tác qua nhiều lượt;
  hai khái niệm này không phải fine-tuning.
- **Fine-tuning:** cập nhật trọng số model bằng dataset huấn luyện. Nó cần data, baseline eval,
  versioning và vận hành model; không chỉ là “viết prompt kỹ hơn”.
- **RAG/retrieval:** truy xuất dữ liệu ngoài prompt tĩnh rồi đưa phần liên quan vào context. `rg` và
  đọc file just-in-time là retrieval bằng tool, nhưng không phải một vector-RAG service.
- **MCP:** protocol chuẩn để AI application kết nối resource, prompt và tool bên ngoài. Việc runtime
  có một MCP tool không có nghĩa ứng dụng Litmatch đã trở thành MCP/AI product.
- **LangChain / LangGraph:** lần lượt là framework agent cấp cao và runtime/orchestration cấp thấp;
  chúng không phải điều kiện để một repository có harness tốt.

**“Fire-turn” không phải thuật ngữ chuẩn được nhận diện và trước handbook này không có evidence
triển khai trong repository**, nên tài liệu không coi đó là một capability hoặc tự khẳng định ý
định. Vì từ này đứng cạnh prompt engineering và LangChain, nó có thể là cách viết nhầm của
**fine-tuning**; đây chỉ là giả định để giải thích thuật ngữ phía trên. Nếu ý định là từ khác:

- **first-turn**: chất lượng ở lượt đầu của hội thoại;
- **few-turn**: một số ít lượt tương tác;
- **fire-and-forget**: khởi chạy async rồi không theo dõi; trong code backend đây thường là
  anti-pattern cần xử lý promise/lỗi, không phải kỹ thuật huấn luyện AI.

## 20.4 Ma trận trend: đã áp dụng, chưa áp dụng và vì sao

Trạng thái chỉ nói về evidence hiện có trong repository:

- **Applied:** có policy và cơ chế thực thi/test tương ứng.
- **Partial:** có một phần hữu ích, nhưng chưa đủ để nhận claim rộng hơn.
- **Not applied:** không có evidence triển khai; đây không mặc nhiên là thiếu sót.
- **Deferred:** chỉ xem xét lại khi trigger định lượng xuất hiện.

| Capability / trend                           | Trạng thái                            | Litmatch đang làm gì                                                                                                                                                             | Vì sao chưa làm thêm / trigger xem xét lại                                                                                                                                           |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt engineering                           | Partial, versioned developer workflow | Task/role contract và blind-review prompt được version; chưa có prompt registry hoặc automated behavior eval chứng minh agent luôn làm theo chúng.                               | Chưa có product LLM. Chỉ thêm versioned product prompt khi một feature AI có owner, eval và privacy boundary.                                                                        |
| Context engineering                          | Applied                               | `.agents/context-map.json`, `pnpm agent:context`, Read first/Read when applicable, canonical-source hierarchy, bounded file/log reads và handoff gọn tạo progressive disclosure. | Không nạp toàn repo hoặc mọi checklist theo thói quen vì attention/context là hữu hạn. Mở rộng scope khi một task lặp lại đang thiếu đúng nguồn bắt buộc.                            |
| Harness engineering                          | Applied, repo-native                  | `AGENTS.md`, skills, router, pre-tool guard, repository checker, hooks, CI và execution budget bao quanh runtime/model.                                                          | Không thay bằng framework chỉ để theo trend. Thêm abstraction khi có ít nhất hai workflow thật cần cùng lifecycle/persistence.                                                       |
| Policy/guardrails as code                    | Applied                               | Guard thuần chặn app deploy thứ tư, ORM unsafe, ledger mutation, migration sai, E2E rỗng và frontend boundary; cùng rule chạy ở adapter và diff/CI.                              | Guard chỉ chặn pattern xác định, không chứng minh business correctness. Rule mới cần positive + negative test và owner.                                                              |
| Multi-agent + model routing                  | Applied, bounded                      | `adaptive-orchestration` giữ root làm owner, chỉ fan-out workstream độc lập, cap hai sub-agent và nâng tier theo risk/conflict.                                                  | Không dùng “swarm” mặc định vì tăng token, collision và khó quy trách nhiệm. Tăng fan-out chỉ sau khi contract repo đổi kèm eval chất lượng/chi phí.                                 |
| Human-in-the-loop                            | Applied ở authority/review            | Agent phải dừng khi cần authority mới; destructive/external action theo permission; sensitive flow cần review evidence và PASS.                                                  | Chưa có approval queue riêng vì coding runtime/PR đã là điểm kiểm soát. Cần service riêng khi có long-running autonomous workflow ngoài phiên dev.                                   |
| Agent evals                                  | Partial                               | Tier 1 kiểm tra deterministic thư viện golden bugs; Tier 2 chuẩn bị blind LLM review theo từng fixture; code/test/review-module đo outcome của change thật.                      | Tier 2 chưa tự chạy/chấm/baseline trong CI. Chỉ tự động hoá khi có budget, model/version pin, grader calibration, threshold và nơi lưu kết quả không chứa dữ liệu nhạy cảm.          |
| Few-shot / canonical examples                | Not applied; có eval fixtures         | Golden bugs là case eval canonical và skills có output-contract example, nhưng không có runtime truy xuất solved examples vào prompt.                                            | Thêm few-shot khi eval chỉ ra lỗi format/decision lặp lại và một tập ví dụ nhỏ cải thiện ổn định; không nhét toàn bộ edge case vào mọi prompt.                                       |
| Skills và developer tools                    | Applied                               | Skills được version, validate và route theo trigger; local tool thực thi context, guard, test và generator.                                                                      | Thêm tool chỉ khi contract rõ, output gọn và có test; không mở rộng toolset chỉ để tăng capability danh nghĩa.                                                                       |
| MCP                                          | Partial, runtime-conditional          | Luồng Nx Cloud/CI có instruction gọi MCP khi runtime expose tool tương ứng; repo không chứa app MCP client/server.                                                               | Không claim một MCP ecosystem ở Litmatch. Thêm MCP server/client khi có external system ổn định, least privilege, consent và integration test.                                       |
| Durable memory / learning                    | Partial, procedural                   | Canonical docs, handoff, learning record và lessons registry giữ tri thức đã kiểm chứng qua phiên làm việc.                                                                      | Không có vector memory tự ghi vì dễ stale, rò dữ liệu và biến suy đoán thành “fact”. Chỉ thêm runtime memory khi có retention/privacy policy và retrieval eval.                      |
| RAG / vector search                          | Not applied                           | Repo dùng cấu trúc file, path, `rg` và context map để truy xuất just-in-time.                                                                                                    | Corpus hiện có cấu trúc và kiểm tra được bằng local tools. Xem xét RAG khi nguồn quá lớn/phi cấu trúc, search hiện tại đo được là không đủ và có groundedness eval.                  |
| Fine-tuning                                  | Not applied                           | Không có dataset/model lifecycle hay baseline chứng minh cần đổi trọng số model.                                                                                                 | Prompt/context/harness rẻ hơn, inspectable hơn và không khóa provider. Chỉ fine-tune sau khi lỗi ổn định vẫn tồn tại qua các lớp đó, có dữ liệu hợp pháp và eval chứng minh lợi ích. |
| LangChain / LangGraph                        | Not applied                           | Agent engineering hiện dùng runtime bên ngoài + script/skill nhỏ, composable và kiểm tra được trong repo.                                                                        | Không có product agent cần durable state, resume, streaming hay graph orchestration. Xem xét bằng ADR khi use case đó xuất hiện; không cài chỉ để có tên framework.                  |
| Agent tracing / LangSmith-like observability | Not applied                           | Check hiện tại lưu outcome ở terminal/CI/PR; chưa có agent service chạy production.                                                                                              | Cần khi có multi-turn eval/agent service lặp lại và phải debug trajectory. Trước đó phải chốt privacy, redaction, retention, cost và access control.                                 |
| Product-facing generative AI                 | Not applied có chủ đích               | AI-native hiện tối ưu engineering workflow; feature deterministic vẫn dùng rule/catalog/template từ server.                                                                      | Chỉ thêm khi product requirement, threat model, moderation, data policy, cost/SLO, fallback và eval được phê duyệt.                                                                  |

Evidence chính cho các trạng thái trên:

- Context/router/role contract:
  [context map](../.agents/context-map.json),
  [`context.mjs`](../scripts/agent/context.mjs) và
  [`adaptive-orchestration`](../.agents/skills/adaptive-orchestration/SKILL.md).
- Guard/harness:
  [`pre-tool-guard.mjs`](../scripts/agent/pre-tool-guard.mjs),
  [`guard-core.mjs`](../scripts/agent/guard-core.mjs),
  [`repository-check.mjs`](../scripts/agent/repository-check.mjs) và
  [rule enforcement matrix](./14-rule-enforcement-matrix.md).
- Eval:
  [golden bug loader](../scripts/agent/golden-bugs.mjs),
  [blind eval prep](../scripts/agent/golden-bugs-eval-prep.mjs) và
  [08 § 8.8](./08-working-with-agents.md#88-eval-golden-bugs--2-tầng-chỉ-tầng-1-nằm-trong-ci).
- Human evidence/learning:
  [PR template](../.github/PULL_REQUEST_TEMPLATE.md),
  [project lifecycle](./19-project-lifecycle-and-learning.md) và
  [lessons registry](./reference/lessons-registry.md).

## 20.5 Vì sao không “áp dụng hết trend”

Một dependency AI mới chỉ được nhận khi trả lời được cả sáu câu hỏi:

1. **Problem:** lỗi hoặc giới hạn nào đã được quan sát, thay vì chỉ là dự đoán?
2. **Baseline:** eval/test nào đo chất lượng, latency, cost và safety trước thay đổi?
3. **Smallest mechanism:** prompt, context, deterministic code hoặc tool hiện có có giải quyết được
   trước khi thêm framework/model không?
4. **Ownership:** ai chịu trách nhiệm data, prompt/model version, rollback, incident và chi phí?
5. **Inspectability:** agent và người mới có thể đọc, chạy local, test và debug cơ chế đó không?
6. **Exit condition:** khi nào thử nghiệm được coi là thành công, thất bại hoặc phải gỡ bỏ?

Litmatch ưu tiên **deterministic shell/Node checks cho luật xác định** và dùng model cho phần cần
phán đoán. Cách này giảm false confidence: AI đề xuất/review, còn invariant và outcome được chặn hoặc
đo bằng code khi có thể.

## 20.6 Prompt và context contract dùng ngay

Người dùng không cần viết một “siêu prompt”. Một yêu cầu tốt có thể ngắn:

```text
Objective: <kết quả quan sát được>
Out of scope: <điều không được mở rộng>
Acceptance: <test/evidence cho biết đã xong>
Constraint: <boundary, compatibility, budget hoặc deadline>
```

Agent phải chuẩn hoá nó thành task contract, tự tìm scope và nêu assumption an toàn. Không yêu cầu
người dùng đoán tên skill/model. Với task nhạy cảm, bổ sung business flow, invariant, vị trí chặn và
test thật theo `review-module`.

Context tốt tuân theo thứ tự:

1. luật bắt buộc và authority;
2. tài liệu canonical đúng scope;
3. code/test ngay sát change surface;
4. lịch sử hoặc nguồn ngoài chỉ khi cần giải thích quyết định;
5. log/tool output đã cắt về phần liên quan.

Không đưa secret, full chat history, chain-of-thought, raw log dài, bundle, lockfile hoặc tài liệu
không liên quan vào context chỉ vì “có thể hữu ích”.

## 20.7 Lỗi người mới và agent thường gặp

- Đọc mọi tài liệu trước khi biết scope, làm loãng context và bỏ sót luật thật sự quan trọng.
- Nhét mọi luật vào `AGENTS.md`; entry point phình to sẽ cạnh tranh attention với task/code.
- Coi roadmap, plan có ngày hoặc generated report là current architecture/domain truth.
- Tin claim “implemented”, “PASS” hoặc “production incident” mà không mở source/test/primary record.
- Dùng model mạnh hơn, nhiều agent hơn hoặc prompt dài hơn thay cho một acceptance test rõ.
- Delegate hai nhánh cùng sửa một file hoặc để sub-agent tự quyết authority của root.
- Revert/format lại dirty worktree không thuộc ownership của task.
- Thêm guard regex rồi tuyên bố business flow đã đúng; rule máy và review domain có vai trò khác nhau.
- Dùng frontend/gateway để bù business API thiếu, phá boundary ba backend deployable.
- Với Economy, sửa/xoá ledger cũ hoặc coi `Wallet.balance` là source of truth.
- Tự động bật recurring LLM eval, hosted tracing hoặc connector có chi phí/quyền dữ liệu.
- Cài LangChain, vector DB hoặc fine-tune trước khi có use case, baseline và trigger đo được.
- Ghi prompt, token, secret, PII hoặc suy luận nội bộ vào docs/handoff.
- Báo “xong” mà không nêu file, command/result, assumption, risk và review verdict.

Khi gặp correction hoặc near-miss có thể lặp lại, sửa guard/test/canonical doc ở đúng owner rồi mới
thêm learning record; đừng biến lessons registry thành kho copy của service specs.

## 20.8 Quality gate cho thay đổi AI-native

Thay đổi prompt, context map, skill, router, guard, eval hoặc DOCX generator được coi là code:

1. Chạy `pnpm agent:context agents`.
2. Nêu hành vi cũ/mới và failure mode cần ngăn.
3. Với rule deterministic, thêm positive case và negative case.
4. Với prompt/eval, không lộ expected answer cho agent đang được chấm.
5. Chạy tối thiểu `pnpm agent:check`, `pnpm agent:test`, `pnpm docs:check` và
   `pnpm format:check`, trừ khi context command yêu cầu gate chặt hơn.
6. Nếu check fail do thay đổi có sẵn ngoài scope, ghi rõ command, lỗi gốc và path ownership; không
   sửa business code để làm xanh một task tài liệu nếu chưa được giao quyền.
7. Handoff theo [08 § 8.6](./08-working-with-agents.md#86-handoff-contract).

`review-module: N/A` — handbook và pipeline DOCX mô tả developer tooling/documentation, không đổi
business flow. Nếu một thay đổi AI-native sau này chạm Economy, Matching, Calling, Gift, Party Room,
Feed hoặc Trust & Safety, quality gate domain vẫn áp dụng đầy đủ.

## 20.9 Hướng phát triển có điều kiện

- **Giữ ngay bây giờ:** context theo scope, harness nhỏ kiểm tra được, guard độc lập model, eval hai
  tầng, root authority và sub-agent cap.
- **Cải thiện tiếp khi có budget:** runner Tier 2 xuất result có cấu trúc, pin model/harness version,
  nhiều trial và threshold; human calibration vẫn bắt buộc trước khi biến thành blocking gate.
- **Chỉ theo trigger:** MCP connector mới, RAG/vector memory, LangGraph/durable runtime, hosted
  tracing, product LLM và fine-tuning phải có use case + owner + eval + privacy/cost plan + ADR khi
  ảnh hưởng kiến trúc.

Không dùng mục này như roadmap cam kết. Trạng thái dự án vẫn thuộc [07 · Roadmap](./07-roadmap.md);
quyết định kiến trúc bền vững phải đi qua ADR.

## 20.10 Nguồn định hướng và nguyên tắc cập nhật

Các nguồn chính thức dưới đây giải thích thuật ngữ/trade-off; evidence trong repo mới quyết định
Litmatch đang áp dụng gì:

- OpenAI:
  [Harness engineering](https://openai.com/index/harness-engineering/) và
  [Model optimization](https://developers.openai.com/api/docs/guides/model-optimization).
- Anthropic:
  [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents),
  [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) và
  [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
- LangChain:
  [Frameworks, runtimes, and harnesses](https://docs.langchain.com/oss/python/concepts/products).
- Model Context Protocol:
  [Introduction](https://modelcontextprotocol.io/docs/getting-started/intro) và
  [server primitives](https://modelcontextprotocol.io/specification/2025-06-18/server/index).

Kiểm lại nguồn ngày **2026-07-28**. Khi trend hoặc API đổi, cập nhật phần giải thích/trigger; không
đổi status “Applied” nếu chưa có source + executable evidence tương ứng trong repository.

---

[← 19 · Project lifecycle](./19-project-lifecycle-and-learning.md) · [00 · Overview →](./00-overview-and-index.md)
