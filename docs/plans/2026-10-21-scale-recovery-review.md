# Scale recovery hardening — 2026-10-21

Historical working record. Canonical behavior is owned by
[Calling](../services/calling-service.md), [Realtime](../services/realtime-gateway.md), and the
[capacity qualification runbook](../runbooks/capacity-qualification.md).

## Contract and orchestration

- Objective: fix reproducible recovery defects; prevent mixed quota placement during supported
  topology changes; make load/capacity checks expose failed journeys and resource limits.
- Acceptance: regression tests for delayed SFU snapshots, reconnect grace and maximum lease retry;
  real PostgreSQL/Redis checks; independent counterexample review; no unsupported capacity claims.
- Scope: Calling recovery, browser socket recovery, quota bootstrap, load-test assertions,
  capacity/data calculator and operational qualification procedure.
- Boundaries: three backend deployables; server owns timers/state; ledger remains append-only;
  existing dirty worktree edits preserved. No financial or historical data deletion is performed.
- Models: GPT-6.1 Sol high for owned implementation; GPT-6.1 Sol xhigh for independent review.
  No Astra. Router selected delegate-then-independent-review for critical/strict verification.
- Checks: targeted Calling/Postgres, socket, quota/Redis and calculator/load-scenario tests;
  TypeScript, formatting, repository/docs checks and applicable scope preflight.

## Review-module — Calling/Signaling — verify

Flow: member disconnects → webhook or SFU-backed GET records persisted grace → subsequent polls
preserve grace → both members return → server resumes its timer once → ticker owns timeout/end →
durable cleanup retries provider work. Concurrent webhooks can invalidate an in-flight SFU snapshot.

Socket flow: transport/pod dies → namespace admission may reject orphan quota → bounded jitter
retries through the maximum supported lease → successful connect refetches durable state.
Logout cancels retries; authentication refresh remains bounded.

| Assumption                                                                | Failure vector                                                                            | Guard/evidence                                                                                                                                              | Verdict                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| GET cannot end a call before reconnect grace or extend grace on each poll | repeated polling during a short disconnect                                                | `apps/core-api/src/modules/calling/calling.service.ts:623` preserves the first grace timestamp; PostgreSQL composition at `calling.integration.spec.ts:880` | PASS                                                               |
| SFU snapshot cannot overwrite newer webhook state                         | pending/active read followed by activation, rejoin or disconnect while provider I/O waits | row lock and status/timestamp comparison at `calling.service.ts:590`; Pending composition at `calling.integration.spec.ts:1103`                             | PASS                                                               |
| Missing joined webhook remains recoverable                                | SFU contains both members while DB still records grace                                    | `calling.service.ts:613` and `:625`; PostgreSQL regression at `calling.integration.spec.ts:1018`                                                            | PASS                                                               |
| Pause is accounted once                                                   | duplicate/reordered polls and joined webhooks                                             | locked timer helper at `calling.service.ts:712` clears grace after accounting; real PostgreSQL pause/resume assertions                                      | PASS                                                               |
| Orphan quota does not permanently strand browser                          | full quota, hard kill, lease up to 300 seconds                                            | `apps/web/src/shared/realtime/socket.ts:76` bounds retries; 90/300-second fake-clock cases at `socket.spec.ts:139`                                          | PASS for supported lease range; browser fault drill still required |
| One user has one quota placement during supported rollout                 | modulo shard remap with old and new gateways                                              | persistent fingerprint at `apps/signaling-gateway/src/app/connection-quota.service.ts:199`; Redis cutover tests in `quota-topology.integration.spec.ts`     | PASS; includes Redis query-database remap regression               |
| Failed journey cannot disappear from load denominator                     | login/queue/confirm/match timeout or failed call-state read                               | `loadtest/calling-flow.js:101` records each iteration in `finally`; executable scenarios in `scripts/reliability/calling-loadtest.test.mjs:89`              | PASS                                                               |

Checklist: ownership/authentication unchanged; timer uses server time; terminal state and cleanup
remain domain-owned; SFU I/O occurs outside row locks; no new backend; no ledger/schema changes.
Economy verification is N/A because the patch does not change money flow. Calculator/docs-only
changes have `review-module: N/A`; their deterministic checks still apply.

Independent review identified a delayed Pending snapshot race after the initial Active-only fix.
That composition is included in the corrective implementation and regression verification.

## Executed evidence

- Calling direct Jest: 34 unit + 23 real PostgreSQL integration cases PASS (57 total, 0 skipped).
- Browser socket direct Vitest: 16 cases PASS, including retry through the maximum quota lease.
- Quota direct Jest: 26 cases PASS across 2 suites, including 3 real Redis topology/cutover cases and the Redis database-query remap regression.
- Signaling-gateway Nx test target: 160 tests PASS; 3 skipped tests and 1 integration suite skipped by its existing gate. The target completed successfully.
- Capacity/data, executable k6 journey scenarios and evidence verifier: 53 tests PASS.
- Documentation generator/validator: 21 tests PASS, including ZIP symlink rejection; generated-report check PASS. Documentation navigation: 11 tests PASS.
- Repository agent checker and OpenAPI contract check: PASS. Scoped formatting of changed paths: PASS.
- Nx lint for core-api, signaling-gateway and web: PASS, with 14 warnings and no errors.
- Nx build for core-api and signaling-gateway: PASS. The web target completed Next.js compilation, TypeScript checking and prerendering, then Nx packaging failed on this Windows host with OS error 1314 (required privilege unavailable); web build is therefore not reported PASS.
- `pnpm agent:verify calling` did not complete: 3 Windows kill-process tests in the general stage-runner suite failed under the initial runner permissions. The isolated six-case elevated rerun passed. Calling and Signaling behavior assumptions were reviewed against the source and the real database/Redis tests; independent counterexample review passed.
- The scoped preflight ran `pnpm agent:check` successfully. Dependency links were restored from the existing offline cache without changing package manifests or the lockfile.

Integration checks used a task-specific local PostgreSQL database and Redis container. Final command logs are under `.tmp/scale-hardening` and are local diagnostics.

## Remaining qualification and architectural work

| Review concern                          | Delivered here                                                       | Remaining requirement                                                            |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Gateway ceiling versus 10 million CCU   | headroom-aware arithmetic check, manifest/default parity tests       | measured sockets/pod, custom-metric autoscaling, provisioned fleet/regions       |
| PostgreSQL write capacity/hot recipient | explicit configured writer mismatch and mixed-load qualification     | measured workload and reviewed data placement/transaction design before sharding |
| Multi-year data growth                  | effective purge timing/admission sensitivity and lifecycle procedure | approved retention/archive policy, migration/backfill/restore design             |
| Reconciliation scan/revisit time        | explicit audit-lag qualification requirement                         | immutable segment/checkpoint design, coverage SLO and performance evidence       |
| Outbox relay/backlog                    | consumer/replay/drain acceptance procedure                           | broker/consumer provisioning and sustained outage/catch-up benchmark             |
| Redis/media HA and restore              | explicit fault, RPO/RTO, PITR and media-rejoin qualification         | infrastructure topology and actual failure/restore measurements                  |

These remaining items are not marked implemented by this patch. Production manifest safety caps,
dry-run retention and disabled unprovisioned broker relay are not raised merely to make a model pass.
The production capacity verdict remains unqualified until actual deployment evidence exists.

## Final verification

The Calling recovery, browser reconnect, quota cutover and capacity/load-scenario changes passed their scoped tests and source review. Repository, documentation, lint, OpenAPI and the core-api/signaling-gateway builds passed. The full Calling preflight remains incomplete because Windows kill-process tests failed under the general runner; web packaging remains incomplete because this host lacks the privilege required by Nx output. The application is not qualified for 10 million CCU: deployment sizing, sustained-load measurements and recovery drills remain required.
