# Litmatch project memory — compact startup index

Read this short, stable index at every session. Follow links only when the task needs detail. This
file is an index, not a replacement for canonical rules, service specs, or executed tests. It is
intentionally much smaller than the onboarding handoff so startup does not load the whole project.

Snapshot: repository baseline `HEAD ce788b9` (2026-08-01); any dirty worktree path belongs to its
author until ownership is explicit.

## Contract

- Three deployable backends only: `core-api`, `signaling-gateway`, `media-server`; new domains are
  Core API modules unless a new architecture decision allows otherwise.
- Economy is append-only double-entry: `LedgerEntry` is truth, `Wallet.balance` is a snapshot,
  `Transaction.idempotencyKey` is database-unique; corrections use reversal entries.
- Postgres owns durable state; Redis is coordination/index/queue only where the service contract
  says so. State transitions, retries and cross-process side effects need atomicity/idempotency.
- Frontend consumes API contracts and does not own business logic. Keep OpenAPI/client generation
  synchronized.
- Do not track secrets, machine-specific addresses, real production data, or unsupported claims.

## Project shape from zero

- Litmatch is a social-entertainment product built around anonymous matching, interaction, trust &
  safety, and an Economy boundary. Product intent is [`docs/01-product-features.md`](../01-product-features.md);
  current source evidence is indexed by [`docs/feature-registry.json`](../feature-registry.json).
- The repository was bootstrapped as an Nx + pnpm + Node 22 monorepo, then grew through Foundation →
  Economy → Matching/Realtime/Calling/Friend → Social/Discovery/Safety → Content → Scale/Operations.
  Dated milestone evidence and deferred triggers are in [`docs/07-roadmap.md`](../07-roadmap.md);
  detailed history is in [`project-handoff.md`](./project-handoff.md).
- The capability registry currently has source/test evidence for Auth/User, Economy, Matching,
  Soul/Voice/Friend, Party/Gift, Feed/Story, Discovery/Nearby, Safety, Avatar/Mood/Streak,
  Notification, Movie/Palm/Mini Game, Short Video, Support/Admin, runtime capabilities and
  realtime fanout. `implemented` is repository evidence, not production/provider readiness.

## Runtime topology and ownership

- Deployable backends are exactly `apps/core-api`, `apps/signaling-gateway`, and
  `apps/media-server`. `apps/admin` and `apps/web` are frontends; `libs/api-client` is the only
  generated REST client boundary. Shared libraries include auth, DTOs, exceptions, config,
  logging, observability and E2E support.
- Business domains are NestJS modules inside `core-api`: `auth`, `user`, `economy`, `matching`,
  `soul-match`, `calling`, `friend`, `party-room`, `gift`, `discovery`, `feed`, `safety`,
  `notification`, `avatar`, `mood`, `movie-match`, `palm-match`, `mini-game`, `short-video`,
  `support`, and `admin`. Cross-module imports use each module's public `index.ts` API.
- Postgres is the durable source of truth and schema changes require a new migration. Redis is
  coordination/index/queue/ephemeral presence only where the service contract says so; Kafka/outbox
  provides event delivery where enabled; LiveKit owns media transport through the media boundary.
- The gateway transports/fanouts and enforces transport quota; it does not own business decisions.
  Frontend renders server contracts and must not become a second business-rule engine.

## Product readiness boundary

- Local/CI source, contract, test, migration, release-profile and observability scaffolding can be
  complete while production remains deferred. Do not claim Apple/Google IAP, push, video providers,
  multi-region, capacity/SLO or legal policy approval without the corresponding runtime evidence.
- Current roadmap gaps and triggers are authoritative in [`docs/07-roadmap.md`](../07-roadmap.md),
  not in this startup index. ADRs own durable topology/security decisions; service specs own behavior.

## Retrieval route

`AGENTS.md` → `docs/00-overview-and-index.md` → this index → `pnpm agent:context <scope>` →
canonical scope docs → targeted test/guard → exact evidence. Every scope auto-loads this index;
`project-handoff.md` is conditional for onboarding/ownership transfer, not normal startup. Plans and
chat are historical context, not authority. A test source is not proof that the test just ran.

## Startup budget

- Read only this file plus the scope's **Read first** paths. Read **Read when applicable** after the
  task contract proves the condition. Do not load roadmap, all service specs, all ADRs, generated
  reports, or the full handoff just because they exist.
- For a non-trivial task, state objective/out-of-scope/acceptance/scope/risk/checks, inspect
  `git status --short`, then route with adaptive orchestration. Existing dirty paths are not yours.
- The context map and its tests enforce this routing. `pnpm agent:context <scope>` prints paths and
  required checks; `pnpm agent:check` validates the map and adapters.

## Reusable corrections

`LRN-001` data lifecycle must support claimed precision; `LRN-002` a failed PostgreSQL statement
aborts its transaction; `LRN-003` timer overlap needs boundary catch + `finally` + cross-process
guard; `LRN-004` environment values have one validated owner; `LRN-005` reconnect must restore
durable state; `LRN-006` targeted PASS differs from repository-wide PASS; `LRN-007` exporter
endpoint protocol must match its name; `LRN-008` aggregate CI needs per-stage watchdogs and an
explicit `TIMED_OUT`; `LRN-009` isolate timing-sensitive lease tests; `LRN-010` token rotation
needs unique `jti` in the same clock second. Details and evidence: [`lessons-registry.md`](./lessons-registry.md).

## Learning and handoff rule

After a verified correction or repeatable near-miss: preserve evidence → record fact/root cause/
scope → add the smallest guard or regression test → link the lesson/ADR → run applicable checks →
commit the durable change. Mark uncertain lessons `proposed` or `monitoring`; do not promote guesses
to rules. Full project history, capability map, lifecycle and limitations:
[`project-handoff.md`](./project-handoff.md). Do not store chat transcripts, hidden reasoning,
secrets, user data, or model-session assumptions in either file.

## Session safety

Check `git status --short`; preserve existing work. Before handoff record exact SHA, commands,
environment, PASS/FAIL/TIMED_OUT, skipped suites and open risks. External provider state and model
session history are not automatically available; only committed, linked artifacts transfer. The
handoff contract is: Outcome → Files changed → Commands/results → Assumptions/decisions → Open
risks/follow-ups → Review verdict.
