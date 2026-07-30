# 19. Project lifecycle, incident response, and learning

This is the operating route for people and agents. It joins existing canonical documents; it does
not replace domain rules, ADRs, release runbooks, tests, or generated evidence.

## 19.1 Reading and evidence vocabulary

Use these terms consistently so a document does not imply more certainty than it has:

| Term                    | Meaning                                                                                                                    | Where it belongs                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Fact**                | Current repository behaviour or an approved decision, linked to source/test/ADR.                                           | Canonical doc, ADR, runbook, registry.                                                       |
| **Historical evidence** | A dated plan, review, commit, or test result records a past observation or decision. It is not a current production claim. | [Plan/review note](./plans/README.md) or [lesson registry](./reference/lessons-registry.md). |
| **Inferred risk**       | A plausible failure mode without an observed incident.                                                                     | Review plan, checklist, or follow-up.                                                        |
| **Deferred work**       | Deliberately not done; include a trigger or owner when known.                                                              | Roadmap, ADR consequence, or service spec.                                                   |

Do not call a test failure, design correction, or repository commit a production incident unless a
primary incident record says so. Generated reports remain views, as defined in
[18 · Documentation automation](./18-documentation-automation.md).

## 19.2 Fast newcomer path

1. Read `/AGENTS.md`, then [00 · Overview](./00-overview-and-index.md). Set up the repository with
   the [local development runbook](./runbooks/local-development.md). If working with agent
   infrastructure or learning the AI-native workflow, read
   [20 · AI-native handbook](./20-ai-native-handbook.md), then run `pnpm agent:context <scope>`.
2. Select the change surface: architecture/ownership ([03](./03-architecture.md),
   [11](./11-engineering-principles.md)); domain rule/spec ([06](./06-domain-rules.md),
   `docs/services/`); frontend ([12](./12-frontend-architecture.md),
   [13](./13-frontend-coding-standards.md)); or release/operations (`docs/runbooks/`).
3. Before a non-trivial change, record the short task contract in
   [08 § 8.1](./08-working-with-agents.md#81-task-contract), inspect the shared worktree, and
   preserve edits outside the agreed file scope.
4. Before handoff, use the change lifecycle below and the
   [quality-gate ladder](./runbooks/quality-gates.md). For a sensitive business flow, the
   `review-module` gate is additional, not optional.

## 19.3 Change lifecycle

| Stage       | Required outcome                                                                                    | Expected evidence / owner                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Discover    | Problem, user/operational impact, scope, and constraints are explicit.                              | Task contract; roadmap or dated plan only as scope/history, never as technical law.                                                    |
| Design      | Ownership, boundary, assumptions, alternatives, and deferred work are clear.                        | Canonical [03](./03-architecture.md), [11](./11-engineering-principles.md), and an ADR for a durable decision.                         |
| Change      | Small, owned edits preserve invariants and compatibility.                                           | Canonical [05](./05-coding-standards.md), [14](./14-rule-enforcement-matrix.md), and local `AGENTS.md`.                                |
| Test/review | Behavior, invariants, and affected contracts have proportional tests and review.                    | [Quality gates](./runbooks/quality-gates.md), [10](./10-code-review-checklist.md), service spec, and `review-module` where applicable. |
| Release     | Exact artifact/SHA, migration order, rollback/forward plan, and smoke checks are known.             | Applicable runbook; [15](./15-commit-guidelines.md); ADR constraints.                                                                  |
| Observe     | Signals, limits, and ownership are recorded; lack of telemetry is a stated gap.                     | [11 § 11.4](./11-engineering-principles.md#114-test-và-vận-hành) and the applicable operational runbook/ADR.                           |
| Learn       | Reusable correction is captured and linked to its guard/test; no blame narrative.                   | [19.5](#195-lesson-lifecycle), a dated primary record, and the lessons registry when reusable.                                         |
| Deprecate   | Consumer migration, compatibility end date/condition, removal owner, and verification are explicit. | Canonical ADR/service spec/runbook plus a tracked implementation change.                                                               |

The lifecycle is a routing aid, not permission to broaden a task. Concurrent refactors and all
pre-existing changes belong to their authors unless the task explicitly includes them.

## 19.4 Error and incident lifecycle

An **error** is any unexpected result noticed in development, CI, review, monitoring, or release.
An **incident** is an operational event with user, security, data, availability, or release impact;
declare it only from evidence. Both start with the same safe path:

1. **Detect and preserve evidence** — record time window, symptom, affected surface, correlation
   IDs/log links when safe, and the exact command/alert. Do not put secrets or personal data in a
   lesson.
2. **Triage impact** — classify observed impact separately from suspected impact. For security,
   money, data integrity, or active availability risk, stop unsafe rollout and involve the designated
   operational owner before changing scope.
3. **Declare and coordinate** — record the provisional severity from observed impact, name one
   incident/operational owner with closure authority, choose a coordination channel, set the next
   stakeholder/user update time, and start a timestamped decision log. Each update separates known
   facts from hypotheses and omits secrets/personal data. If the project has no severity taxonomy
   or communication owner, record that as an explicit operational gap instead of silently skipping
   coordination. Use the [incident-record template](./templates/incident-record.md) when primary
   operational evidence exists.
4. **Contain safely** — prefer feature disablement, traffic stop, or documented rollback/forward
   path. Do not edit historical migrations or ledger entries to conceal a failure.
5. **Diagnose and correct** — link the smallest reproducible evidence to a root cause. A hypothesis
   stays a hypothesis until verified.
6. **Verify recovery** — run the relevant tests/smoke checks and confirm the intended signal. A
   green local check does not prove production recovery.
7. **Learn, communicate, and close** — the named owner records recovery time and unresolved risk,
   sends the final status through the chosen channel, and closes only with the stated authority.
   Add or update a lesson only when its cause and prevention are sufficiently evidenced; assign
   owner/status and link the guard, test, ADR, or follow-up.

Use [zero-cost release](./runbooks/zero-cost-production.md),
[hosted-free release](./runbooks/hosted-free-release.md),
[Grafana](./runbooks/grafana-cloud.md), and [PostHog](./runbooks/posthog-cloud.md) for their
specific operational procedures. If no applicable runbook exists, record that gap as deferred work
rather than inventing a recovery procedure.

## 19.5 Lesson lifecycle

The durable unit is a short record following
[the template](./templates/learning-record.md). Keep it in
[the registry](./reference/lessons-registry.md) when it is reusable beyond one change.

- Create a record after a verified correction, a review finding that changed the implementation, or
  a repeatable near-miss. Link the primary source.
- Use `proposed` for an unverified hypothesis, `active` when a prevention/guard is in place,
  `monitoring` when effectiveness still needs evidence, and `closed` only when the stated
  verification is complete. `superseded` links its replacement.
- Update the record when a prevention proves insufficient; never rewrite history to make a prior
  conclusion appear certain.
- Keep domain rules in their canonical owner. A lesson points to the rule and its guard; it does
  not copy a full service specification.

`review-module: N/A` — this document defines documentation and operational learning workflow; it
does not change a business flow.
