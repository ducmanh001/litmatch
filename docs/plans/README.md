# Plans and reviews

Files in this directory are dated working records: plans, reviews, and verification notes. They are
**historical evidence**, not the current canonical state of the product, architecture, domain, or
release process. A `PASS`, proposed guard, or command result in a note describes its recorded
scope/time only; it does not prove present behavior or production status.

## Read the current rule first

Use `/AGENTS.md` and [00 · Overview](../00-overview-and-index.md) to route a task. Then read the
current canonical owner: architecture in [03](../03-architecture.md), domain rules in
[06](../06-domain-rules.md) and `docs/services/`, lifecycle in
[19](../19-project-lifecycle-and-learning.md), and applicable runbooks/ADRs. Use a plan or review
to understand why a decision was made, what was verified then, or which risk was identified.

## Note lifecycle

1. **Create** — add a dated, descriptive Markdown file (`YYYY-MM-DD-<topic>-plan.md` or
   `YYYY-MM-DD-<topic>-review.md`) when a change needs durable assumptions, a decision trail, or
   a verification record. Link the task's canonical docs; do not copy whole specifications.
2. **Work** — distinguish fact, historical evidence, inferred risk, and deferred work. For a
   business flow, use the applicable `review-module` plan/verify process.
3. **Close** — record outcome, exact evidence/checks, assumptions, open risks, and whether a
   canonical document, ADR, runbook, test, or lessons entry was updated. Update that canonical
   owner in the same change when the rule itself changed.
4. **Archive/supersede** — keep the dated note for traceability. Add a short `Superseded by` link
   or follow-up link instead of rewriting it to pretend it describes the present. Do not delete
   notes to hide an error or incident history.

Do not store secrets, personal data, raw production logs, or unsupported incident claims in a
note. Reusable verified corrections belong in the
[lessons registry](../reference/lessons-registry.md); an operational incident follows the evidence
and response path in [19 § 19.4](../19-project-lifecycle-and-learning.md#194-error-and-incident-lifecycle).

## Dated records

- [2026-07-14 — social/discovery plan](./2026-07-14-plan-6-tinh-nang-social-discovery.md)
- [2026-07-15 — UI contract completion](./2026-07-15-ui-contract-completion.md)
- [2026-07-18 — config refactor review](./2026-07-18-config-refactor-review.md)
- [2026-07-18 — content author profile review](./2026-07-18-content-author-profile-review.md)
- [2026-07-18 — hosted monitoring review](./2026-07-18-hosted-monitoring-review.md)
- [2026-07-18 — managed interval refactor](./2026-07-18-managed-interval-refactor-plan.md)
- [2026-07-18 — system role testing review](./2026-07-18-system-role-testing-review.md)
- [2026-07-18 — whole source refactor review](./2026-07-18-whole-source-refactor-review.md)
- [2026-07-18 — zero-cost production plan](./2026-07-18-zero-cost-production-plan.md)
- [2026-07-18 — zero-cost production review](./2026-07-18-zero-cost-production-review.md)
- [2026-07-20 — hosted-free release plan](./2026-07-20-hosted-free-release-plan.md)
- [2026-07-22 — hosted-free release review](./2026-07-22-hosted-free-release-review.md)
- [2026-07-24 — superseded analytics/reporting handoff](./2026-07-24-analytics-reporting-handoff.md)
