# Project handoff — durable engineering memory

This document is the short transfer brief for a new human or coding agent joining Litmatch.
It preserves verified repository knowledge and the route to deeper evidence; it is not a transcript
of an old chat and does not claim access to private external-model or agent sessions.

## 1. How to use this handoff

Start with the repository contract, then select only the scope being changed:

1. Read [`/AGENTS.md`](../../AGENTS.md) and [the documentation map](../00-overview-and-index.md).
2. Read this handoff, then run `pnpm agent:context <scope>`.
3. Read the canonical owner for the scope: architecture, domain rules, service spec, ADR, or
   runbook. Plans and generated reports are evidence, not technical authority.
4. Inspect `git status --short` before editing. Existing changes belong to their authors until
   ownership is explicit.
5. State objective, out-of-scope, acceptance criteria, risk/invariant, and checks before a
   non-trivial change.
6. Add or update a test with the change. For a verified correction or reusable near-miss, update
   the learning record and its guard/test before handoff.

The minimum onboarding command set is:

```bash
pnpm agent:context <scope>
pnpm agent:check
pnpm docs:check
```

Use the scope-specific checks printed by `agent:context`. A source test file is not evidence that
the test has just run; record the exact command, result, SHA, environment, and remaining risk.

## 2. Authority and evidence map

| Question                              | Read first                                                                                                                               | Important boundary                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| What is the product supposed to do?   | [`01-product-features.md`](../01-product-features.md)                                                                                    | Intent is not implementation status.                                               |
| What is implemented or deferred?      | [`feature-registry.json`](../feature-registry.json) and its generated report                                                             | `implemented` means repository evidence exists; it does not prove production PASS. |
| What architecture is current?         | [`03-architecture.md`](../03-architecture.md), [`06-domain-rules.md`](../06-domain-rules.md), `docs/services/`                           | Current rules own behavior; ADRs explain why.                                      |
| Why was a durable decision made?      | [`docs/adr/README.md`](../adr/README.md)                                                                                                 | Never rewrite an old decision; supersede it with a new ADR.                        |
| How is a change or release performed? | [`docs/runbooks/README.md`](../runbooks/README.md) and [`19-project-lifecycle-and-learning.md`](../19-project-lifecycle-and-learning.md) | A local PASS is not production evidence.                                           |
| What mistakes are reusable?           | [`lessons-registry.md`](./lessons-registry.md) and `scripts/agent/golden-bugs/`                                                          | A lesson must link to prevention and evidence.                                     |
| How should an agent work?             | [`08-working-with-agents.md`](../08-working-with-agents.md), [`20-ai-native-handbook.md`](../20-ai-native-handbook.md)                   | Model strength does not replace deterministic guards or tests.                     |

When sources conflict, stop and repair the canonical owner in the same change. Do not silently
choose the most recent plan, generated report, mockup, or chat statement.

## 3. Non-negotiable system knowledge

- There are three deployable backends: `apps/core-api`, `apps/signaling-gateway`, and
  `apps/media-server`. A new domain starts as a Core API module; a fourth deployable requires a
  new ADR and architecture evidence.
- Economy is double-entry: append-only `LedgerEntry` is truth, `Wallet.balance` is a snapshot,
  and a correction is a reversal entry. `Transaction.idempotencyKey` is unique in the database.
- Durable state belongs in Postgres; Redis is a queue/index/coordination aid where the service
  contract says so. Reconnect must restore durable state, not only transport connectivity.
- State machines and side effects must be atomic at their stated boundary. Check-then-act,
  retry, timer overlap, and cross-process races require an explicit guard and regression test.
- Frontend consumes backend contracts and does not own business logic. Keep OpenAPI/client
  generation synchronized.
- Secrets, machine-specific addresses, provider credentials, and real production state do not
  belong in tracked docs or runtime config. Record the contract and provisioning owner instead.
- Never change historical ledger entries or migrations to hide a correction; use append-only
  reversal/forward repair according to the applicable domain rule.

## 4. Verified reusable lessons

The full record is the [lessons registry](./lessons-registry.md). These are the first checks a new
agent should keep in mind:

| Lesson                                           | Transferable rule                                                                                                           | Guard/evidence                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| LRN-2026-001 — [registry](./lessons-registry.md) | Do not expose precision that the data lifecycle cannot support.                                                             | Discovery spec and nearby model.                                  |
| LRN-2026-002 — [registry](./lessons-registry.md) | After a PostgreSQL statement fails, an explicit transaction is aborted; do not recover by reading in that same transaction. | Safety implementation; focused regression test remains a gap.     |
| LRN-2026-003 — [registry](./lessons-registry.md) | Catch timer-boundary failures, release overlap state in `finally`, and use DB/idempotency guards across processes.          | `ManagedInterval` and its regression tests.                       |
| LRN-2026-004 — [registry](./lessons-registry.md) | Keep environment values in the canonical validated path; do not track machine-specific tunnel/IP/credential assumptions.    | Dynamic config regression test.                                   |
| LRN-2026-005 — [registry](./lessons-registry.md) | Socket reconnect is not state recovery; re-fetch durable REST state after missed events.                                    | Web reconnect implementation; focused behavior test remains open. |
| LRN-2026-006 — [registry](./lessons-registry.md) | A targeted PASS and a repository-wide PASS are different claims, especially in a shared dirty worktree.                     | Scope-owned checks plus full-gate evidence.                       |
| LRN-2026-007 — [registry](./lessons-registry.md) | Protocol endpoint names must match the exporter protocol, not only a plausible URL shape.                                   | OTLP resolver and regression test.                                |
| LRN-2026-008 — [registry](./lessons-registry.md) | Do not wrap an aggregate CI gate in a short probe timeout; use per-stage watchdogs and a `TIMED_OUT` marker.                | Stage runner and timeout tests.                                   |
| LRN-2026-009 — [registry](./lessons-registry.md) | Timing-sensitive lease tests need scheduler isolation; increasing TTL to hide starvation is not a fix.                      | CI scheduler and real Redis integration test.                     |
| LRN-2026-010 — [registry](./lessons-registry.md) | Token rotation needs unique identity even when issued in the same clock second.                                             | `jti` implementation and auth E2E/regression tests.               |

These lessons are evidence-backed repository corrections. They are not claims that every symptom
was a production incident; consult the registry classification before repeating that claim.

## 5. What is covered and what is not

### Covered well enough to continue engineering

- Repository boundaries, module ownership, naming, coding standards, and task routing.
- Core business invariants, service contracts, API generation, migrations, and many unit/integration
  tests.
- Architecture decisions and several release profiles, including local CI, hosted-free release,
  observability, smoke checks, rollback paths, and reliability evidence requirements.
- A deterministic agent harness: context routing, repository guards, golden bugs, OpenAPI checks,
  and quality-gate instructions.

### Still incomplete or deliberately external

- This file and the registry do not reconstruct every old session or prove which contribution came
  from which model. Only committed, linked evidence is transferable.
- Tier-2 blind LLM agent evaluation is prepared but not a complete baseline in CI; durable memory
  is procedural, not an auto-writing vector memory.
- Some provider/infrastructure state must be provisioned outside the repo. Never invent credentials,
  domains, real users, production telemetry, or release success from a local test.
- Deferred product capabilities and open gaps remain authoritative in the feature registry, service
  specs, ADR consequences, and dated plans. Read those sources before promising completeness.
- A dirty worktree is not a release snapshot. Before handing this project to another model, commit
  the intended change set, record the exact SHA, and separate unrelated changes.

## 6. Durable learning protocol

After a verified correction, review finding that changed code, or repeatable near-miss:

1. Preserve the smallest safe evidence and separate fact from hypothesis.
2. Record symptom, observed impact, root cause, rejected approach, correct approach, and scope.
3. Add the smallest prevention: deterministic guard, regression test, runbook step, or ADR.
4. Add a row to the registry only when the cause and prevention are sufficiently evidenced.
5. Link the lesson to the canonical rule and the exact guard/test; do not duplicate the whole domain
   specification in the registry.
6. Mark `proposed`, `active`, `monitoring`, `closed`, or `superseded` honestly. Keep missing evidence
   visible instead of upgrading a hypothesis to fact.
7. Run `pnpm docs:check`, `pnpm agent:check`, and the affected scope checks. Include exact results in
   the handoff/PR.

The durable learning unit is not a chat transcript. It is:

```text
verified observation → canonical rule → executable guard/test → indexed lesson → future retrieval
```

`review-module: N/A` — this document records documentation and agent-learning workflow; it does
not change a business flow. Any future edit to Economy, Matching, Calling, Gift, Party Room, Feed,
Safety, or another sensitive flow must use that module's required review gate.
