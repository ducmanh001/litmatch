# 0015. Bounded runtime recovery and independent media nodes

- **Date**: 2026-10-20
- **Status**: Accepted for implementation; runtime validation pending at the user's request
- **Related**: [architecture](../03-architecture.md), [ADR 0005](./0005-livekit-hostnetwork-rtc.md),
  [implementation plan](../plans/2026-10-20-scale-resilience-implementation-plan.md)

## Context

Cluster-wide timer singleton jobs cap throughput independently of the number of API replicas.
Matching queues can be lost while durable tickets survive. Reconciliation's cold-start aggregate
eventually exceeds its statement deadline. Production media with one replica loses all room
capacity during node replacement. These are coordination and availability concerns; they do not
justify a fourth deployable or a change to financial correctness.

## Decision

Calling timer and deferred-cleanup workers claim disjoint batches using an atomic PostgreSQL
UPDATE with SKIP LOCKED. Claims expire using the database clock. State transitions remain guarded
by the existing locked domain rechecks. Unattempted claims are released by exact lease timestamp.

Matching can route complete logical queues to an ordered list of Redis instances. A bounded,
cluster-singleton repair scan restores live tickets with NX and monotone score refresh. Its
cursor survives pod turnover. Topology changes require stopping admissions/matchers, draining or
discarding the derived queues, deploying a consistent ordered topology, and rebuilding from DB;
mixed topology versions must not serve simultaneously.

`runtime_job_checkpoints` stores disposable diagnostic/recovery progress. Ledger reconciliation
pages complete transactions by `(created_at, id)` and commits aggregate plus cursor atomically.
The job remains read-only for financial tables: it never changes ledger entries, wallets,
transactions or receipts. This narrows the earlier phrase "read-only job" to financial data;
writing coordination metadata is explicitly permitted. A partial scan never reports a clean
audit. Periodic full rebase is paged too; it detects late/backdated inserts after a completed pass,
with delay determined by configured page capacity and backlog, not a guaranteed 24-hour bound.

Production media overlays use two replicas on distinct hosts, a disruption budget and native
draining. This supersedes ADR 0005's one-replica deployment restriction for availability only.
The per-room single-node limit, shared LiveKit Redis, host networking and region URL contract
are unchanged. There is no automatic room migration on node failure and no media HPA capacity claim.

Gateway admission bounds local connections and pending authentication/quota work before allocation.
The required Socket.IO Redis adapter remains an explicit shared HA dependency.

## Consequences

- Apply additive migrations before rolling application pods. Keep the old source running during
  migration, then finish the application rollout before relying on the new worker distribution.
- Claims permit at-least-once retries after lease expiry; domain state/idempotency remain the
  safety mechanism. Never treat a lease as exactly-once delivery.
- Checkpoints are rebuildable; they are not authoritative evidence that money is correct.
- Hot/cold archive, retention policy changes and ledger partitioning are separate migrations
  requiring preserved report evidence and database-wide replay/idempotency design. No automatic
  destructive lifecycle policy is enabled by this decision.
- Media needs at least two schedulable nodes, correct routable RTC addresses/firewall rules,
  sufficient Redis availability, and rollout tooling that accommodates its drain grace.
- No runtime checks have been executed for this change. Capacity, failover, restore and
  concurrency tests remain required before production promotion.

## Capacity forecast interpretation

The growth model reports GiB/TiB (binary units), including an explicit dry-run stock projection
where the independent story sweeper still runs. `--annualGrowthRate=0.3 --years=5` means year-one
workload from the inputs, then 30% growth each year. It is an assumption, not an observed trend.
Hot data stock is integrated over its retention window; purge backlog carries between years.
These estimates exclude replica, backup, WAL, bloat and media object storage. They do not authorize
data deletion, retention-policy changes or a claim of measured infrastructure capacity.
