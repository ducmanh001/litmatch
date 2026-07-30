# 2026-07-30 — Documentation reorganization review

Historical review record for the repository-wide documentation reset. Canonical behavior remains
in the linked architecture/domain/runbook owners; this file records why the structure changed,
trade-offs and verification at this checkout.

## Task contract

- **Objective:** make project, feature, architecture, development and operational documentation
  complete enough to navigate, evidence-aware and cheaper to maintain.
- **Out of scope:** business logic/schema changes, provider activation, production verification and
  edits owned by concurrent agents.
- **Acceptance:** clear source hierarchy, current code/config paths and Nx commands, concise roadmap
  with triggers, complete module catalog, deterministic checks and explicit trade-offs.
- **Invariants:** exactly three backend deployables; Economy double-entry append-only; docs-only
  work does not bypass scope checks.

## Baseline findings

| Finding                                                                   | Evidence                                                                                    | Correction                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Plan catalog incomplete                                                   | `docs:check` missed two payOS records                                                       | Added both records to `docs/plans/README.md`                                                   |
| Root/index mixed onboarding, CI, status and architecture                  | Root README 174 lines; roadmap 301 lines                                                    | Root became landing page; procedures moved to runbooks; roadmap reduced to milestones/triggers |
| Product/domain maps omitted current capabilities/entities                 | Runtime capabilities, guest quota, anonymous Movie/Palm and admin/support existed in source | Updated 01/02 and registry evidence                                                            |
| Architecture described generic Call orchestrator/Inbox that did not exist | No `CallOrchestratorService` or generic Inbox in source                                     | 03 now distinguishes current same-DB transactions/outbox from future distributed saga cost     |
| Tech stack still proposed Stripe for web top-up                           | payOS entities/controller/OpenAPI exist                                                     | 04 names payOS + native IAP and runtime readiness caveat                                       |
| Guest quota prose did not match implementation                            | Signed device token + HMAC user/device/network rows under lock                              | 06 records exact authority/idempotency behavior                                                |
| Generated report kept audit-specific prose                                | Generator hard-coded GitHub CI as out of scope                                              | Generator now describes registry boundary generically                                          |
| Module catalog could silently miss a new Core module                      | Index test checked service files, not `apps/core-api/src/modules`                           | Added deterministic module-directory coverage test                                             |

## Design decisions and trade-offs

| Decision                          | Reason / principle                                              | Trade-off accepted                                                     |
| --------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| One owner per truth type          | Single source of truth; separation of concerns                  | Reader follows links instead of seeing every detail copied in one file |
| Progressive-disclosure indexes    | Reduce newcomer/context load                                    | More small landing pages                                               |
| Trigger-based roadmap             | Avoid invented dates/thresholds and duplicate status            | Some work remains undated until evidence/authority exists              |
| Evidence ladder                   | Prevent source/test/local PASS from becoming a production claim | Wording is more explicit and occasionally longer                       |
| Runbook extraction                | Keep root README stable and procedures testable by profile      | Commands live one click deeper                                         |
| Docs-as-code coverage             | Catch missing links/modules/generated drift deterministically   | Semantic correctness still needs independent review                    |
| Preserve numbered anchors/history | Avoid breaking old references; append/supersede records         | Old numbering is not perfectly thematic                                |

## Resulting information architecture

- `README.md` — repository landing, quick start and system map.
- `docs/00` — source hierarchy, role-based routes and complete catalog.
- `docs/01/02/03/06` + `docs/services/` — intent, model, architecture and behavior.
- `docs/07` — next work and evidence triggers, not historical changelog/status mirror.
- `docs/18/19` — documentation governance and project/change/incident lifecycle.
- `docs/runbooks/` — local development, quality, release, reliability and providers.
- Readmes near `apps/`, `libs/`, `deploy/`, `openapi/`, `scripts/` and `layouts/` — artifact-local
  boundary and commands.

## Independent review

The counterexample reviewer found three actionable issues:

1. Generated evidence line locations were stale after roadmap edits.
2. Admin docs/roadmap still deferred room force-close/member counts and published-video moderation,
   although controller/OpenAPI/Admin source implemented them.
3. Nearby/Invite links used unsupported `{#anchor}` syntax and were outside the anchor test set.

All three were corrected: artifacts regenerated, admin claims updated, headings/links normalized,
and the navigation test expanded to cover the affected canonical/service files. Reviewer found no
counterexample against the deployable or Economy invariants.

## Verification

| Check                                  | Result                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm docs:generate`                   | PASS; regenerated product report Markdown/DOCX and handbook projection |
| `pnpm docs:check`                      | PASS; 19 tests + registry/spec/generated validation                    |
| `pnpm agent:check`                     | PASS                                                                   |
| `pnpm agent:verify docs`               | N/A; CLI không định nghĩa scope `docs`                                 |
| Targeted Prettier check on owned files | PASS                                                                   |
| `git diff --check` on owned files      | PASS before final staging                                              |

Full repository format/write profiles were deliberately not run while other agents had a dirty
shared worktree because they execute `pnpm format` and can modify files outside ownership. This is
recorded as a safety decision, not a skipped correctness claim; owned paths received targeted
format checks.

## Assumptions and residual risk

- Source/test evidence reflects this checkout; provider/production readiness still requires
  operational evidence.
- Dated plans and generated reports remain projections and can be superseded.
- Documentation checks prove paths/schema/catalog consistency, not business semantic correctness.
- Future module/provider/route changes must update their canonical owner and projections together.

`review-module: N/A` — documentation/tooling only; no business flow, schema or ledger write path
changed.
