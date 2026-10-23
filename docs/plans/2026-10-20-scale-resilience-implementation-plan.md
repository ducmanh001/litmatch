# 2026-10-20 — Scale and recovery implementation

## Contract

- Objective: remove identified coordination bottlenecks and make recovery work bounded for
  Calling, Matching, Economy reconciliation and gateway admission.
- Scope: the existing three backend deployables, additive migrations, configuration and
  canonical service documentation. Preserve all pre-existing worktree changes.
- Out of scope: production deployment, automatic deletion/archive of user or financial history,
  arbitrary database sharding, and a claim of verified 10 million CCU capacity.
- Acceptance: multiple calling workers claim different rows; matching can rebuild its derived
  queue without client replay and optionally place logical queues on separate Redis instances;
  reconciliation survives process replacement without an unbounded historical aggregate;
  gateway admission is bounded; production media has independent node placement.
- User instruction: do not execute tests, build, lint or verification commands. The user will
  run them afterwards. Source review and regression-test authoring remain in scope.
- Routing: balanced implementation worker for gateway/media; root owns core/data/configuration;
  independent frontier review after the implementation. At most two delegates.

## Review-module plan — Calling / Matching / Economy

Flows:

1. Calling deadline → atomic leased claim → state recheck under row lock → end → deferred cleanup.
2. Durable queued ticket → bounded repair scan → idempotent Redis enqueue → matcher wake-up.
3. Ledger transactions → bounded complete-transaction pages → diagnostic checkpoint → report.
4. Socket admission → local reservation → JWT/Redis quota → connected socket → release.

| Assumption                                     | Failure vector / consequence                            | Planned guard                                                                 |
| ---------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Two timer pods must not process the same batch | Shared LIMIT or released selection locks duplicate work | Atomic UPDATE with SKIP LOCKED and expiring claim columns                     |
| A worker may die after claiming                | Permanent orphaned work                                 | Database-clock claim expiry; state recheck stays authoritative                |
| Redis may lose its queue                       | Durable tickets cannot match                            | Bounded cursor repair; NX plus monotone score refresh; Postgres remains truth |
| Queue placement is stable across pods          | Different URL orders split a queue                      | Deterministic routing, documented ordered topology and migration procedure    |
| A reconciliation pod may restart               | Full-history scan repeats or checkpoint advances twice  | Persisted row lock and atomic page/checkpoint update                          |
| Partial reconciliation is not a clean audit    | False healthy result while history is incomplete        | Report incomplete progress separately and keep success false                  |
| A slow handshake may outlive the socket        | Reconnect bypasses concurrency limit                    | Keep handshake permit until asynchronous admission settles                    |
| A media node may fail                          | All room capacity disappears                            | Multiple nodes with required anti-affinity; no claim that rooms migrate       |

## Invariants

Ledger entries and financial transaction idempotency are unchanged. Reconciliation may write
diagnostic checkpoints only; it never modifies ledger entries, wallet snapshots or receipts.
No new deployable is introduced. Redis remains a disposable projection for matching.

## Handoff

Status: source implementation completed; runtime verification is intentionally NOT RUN at the
user's request. No PASS verdict or production-capacity certification may be inferred from this note.

Implemented: leased multi-pod calling workers; physical queue routing and durable matching repair;
paged ledger reconciliation/checkpoints; bounded multi-batch outbox catch-up; finite gateway
admission; two-host production media placement/PDB/drain; accurate TiB and dry-run growth reporting.
Regression sources were added/updated, including real-Postgres checkpoint resume, concurrent page
ownership and commit-failure rollback cases. They have not been executed.

Independent source review found that settled failed/skipped timer attempts retained their leases;
the implementation now releases the full settled batch with exact timestamp ownership checks.
This includes the failure/skip branch, while an in-flight attempt retains its claim.

Apply migrations `1759100000000` (diagnostic checkpoints), `1759150000000` (call worker leases) and
`1759200000000` (concurrent cursor indexes) before rolling application pods. Multi-Redis Matching
requires identical ordered URLs on every pod and a coordinated drain/rebuild for topology changes.
Production media requires at least two schedulable hosts and a deployment watchdog compatible with
its draining grace. Default gateway admission is conservative and must be sized from measurements.

Deferred: cold archive/partition migration and per-member unread counters; changing retention
policies, enabling Kafka consumers and provisioning HA data services require deployment/product
configuration and the relevant data-preservation design. No financial/user history was deleted,
retention remains staged, and no production resources were deployed.

Follow-up commands after reviewing the diff: `pnpm agent:verify calling`,
`pnpm agent:verify matching`, `pnpm agent:verify economy`, `pnpm agent:verify signaling`,
`pnpm agent:verify media`, and the production-shaped load/recovery exercises in
`../runbooks/reliability-slo-and-evidence.md`.

## Continuation — 2026-10-21

User reaffirmed continued implementation with model selection; the instruction not to execute
tests/verification remains active. Balanced worker owns rotating deep-wallet sampling and its
regression sources; root owns annual-growth forecasting and integration; frontier source review
is reserved for the resulting diagnostic/concurrency changes.

Additional acceptance:

- Deep wallet sampling uses the primary-key order and a durable cursor, wraps in the same run,
  and commits cursor progress only after a consistent snapshot/ledger comparison succeeds.
- Annual storage forecasts accept a bounded annual growth rate. Retained stock integrates only
  the live retention window, and purge backlog carries between years rather than resetting.
- Model output distinguishes year-one traffic from final-year purge requirements, uses TiB,
  and reports the actual dry-run lifecycle separately from delete-enabled assumptions.
- Realtime model defaults reflect the finite 2,000-socket admission limit and 30-replica
  production HPA ceiling. It reports a configuration shortfall explicitly; a theoretical
  50,000-socket/pod override is not the shipped default or a benchmark result.

Regression sources cover compounding, retention under declining traffic, invalid horizons,
wallet continuation/wrap and failed checkpoint updates. Real-Postgres sampler sources cover cold
wallet detection, immediate wrap, concurrent samplers and commit-failure rollback. No test result
is claimed. Independent source review found no additional blocker in this continuation; this is
not a verification PASS and does not replace the user's runtime checks.
