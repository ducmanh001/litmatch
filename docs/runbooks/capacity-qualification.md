# Capacity qualification for a 10 million CCU target

This procedure qualifies a particular build, workload and deployment. Passing a calculator or
unit test does not establish production capacity. Architecture remains the three backends in
[03](../03-architecture.md); production promotion also requires the
[reliability evidence gate](./reliability-slo-and-evidence.md).

## 1. Freeze the workload and deployment

Record the release SHA/image digests, regions, instance classes, replicas, database/Redis service
limits and failure domains. Define peak and daily-average concurrency separately. Record sockets
per user; chat-active fraction and message rate; match arrivals and burst factor; audio/party room
mix, room size, bitrate and TURN share; API mix; reconnect churn; and annual traffic growth.

The repository model starts at 10 million peak CCU but only 10,000 concurrent chatters (0.1%).
It assumes 10 million matches/day and derives 48 million DAU for the data model. These are scenario
inputs, not measured product behavior. Repeat with 1% and 10% chat-active fractions and with a
popular recipient receiving a large share of gifts. Use the actual product distribution when known.

```bash
pnpm capacity:model --json
pnpm capacity:check --json
pnpm capacity:model --chatters=100000
pnpm capacity:model --chatters=1000000
pnpm capacity:data --years=5 --annualGrowthRate=0.3
```

`capacity:check` exits nonzero when configured gateway admission after headroom, assumed database
writer budget or assumed media budget cannot cover the selected scenario. The default target is
expected to fail with current production manifests. Its success is an arithmetic planning check;
it does not replace benchmarks or enable production promotion. Multiple modeled PostgreSQL
primaries express required aggregate throughput: runtime currently has one `DATABASE_URL` and no
multi-writer shard router. Do not provision writers expecting the application to distribute writes.

## 2. Establish sustainable capacity under mixed load

Use the actual deployment network/load balancer, production-equivalent storage and representative
data/index size. Keep load generators outside the serving fleet and record their saturation too.
Run steady load for at least 15 minutes, then 1.5 times the selected peak for 10 minutes, followed by
a soak covering token rotation and periodic jobs. Measure per-journey outcomes, not HTTP latency alone.

| Plane      | Required observations                                                                                        | Failure workload                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Gateway    | accepted/rejected sockets, handshake concurrency, RSS, event-loop delay, outbound backlog, lease refresh lag | abrupt pod loss while each user has full connection quota; retry through the load balancer |
| Redis      | command latency, CPU, connection/output buffers, lease and fanout throughput per shard                       | coordinator failover, one shard unavailable, cold reconnect                                |
| PostgreSQL | query mix, p95/p99, row-lock wait, pool wait, WAL rate, IOPS, replica lag, vacuum progress                   | primary failover; API traffic while retention, reconciliation and outbox drain run         |
| Economy    | balanced ledger, unique idempotency, recipient lock wait, reconciliation lag                                 | hot recipient; duplicate/reordered provider callbacks; verifier outage                     |
| Media      | actual published/subscribed tracks, packet loss, bitrate, CPU/network per node and per room                  | node loss, client rejoin, new room placement while another node drains                     |

Use `lk load-test` for actual media. The REST calling scenario verifies token/control-plane
journeys and cleanup; it does not establish active WebRTC media capacity. It requires successful
journey rate above 95% and at least one completion, including matching/confirmation failures in
the denominator. Real matching accounts must satisfy profile rules; enough compatible users must
be present. Reconcile any cancelled/still-active tickets and rooms when a run finishes.

Scale gateway HPA using connection/handshake pressure only after the metrics adapter is installed
and tested. Preserve failure/rollout headroom and the database connection budget described in
[k8s/README](../../k8s/README.md). Increasing pod count does not increase one database's write budget
or make one LiveKit room span nodes.

## 3. Qualify lifecycle and storage growth

Keep product-approved retention decisions attached to the release. The production template uses
`RETENTION_MODE=dry-run`; changing it to `delete` enables every configured positive-day rule.
Before activation, verify eligible rows, backup recovery, write/read latency, WAL/replica headroom
and vacuum behavior on representative data. Stage the policy change with an explicit rollback
to dry-run; deletion itself is recovered from backup, not undone by that configuration rollback.
Ledger entries remain append-only, with corrections through reversal transactions.

Replace the optimistic batch-count ceiling with measured timing and scheduling availability:

```bash
pnpm capacity:data --years=5 --annualGrowthRate=0.3 --retentionBatchLatencyMs=1000 --retentionAdmissionFraction=0.5 --retentionRuleBudgetFraction=0.5
```

The example is a sensitivity case, not a measured throughput claim. Several rules share a job's
30-second time budget; admission can skip ticks. Track oldest eligible age, inserted versus
deleted rows and backlog drain time per rule. Include WAL, replicas, backups, vacuum bloat and
object storage/CDN in provisioning; the data calculator includes only its modeled table/index stock.

Historical messages, match sessions and financial records need a separately reviewed archive design.
Settle global idempotency, FK ownership, restore and historical query contracts before migrating
tables to partitions. PostgreSQL partitioned unique constraints include partition keys; moving a
globally unique idempotency key into a time-local constraint changes correctness. Archive must
preserve financial truth, auditability and retrieval. Schema changes use new migrations and a
rehearsed backfill/cutover/rollback; no destructive retention policy is implied by this runbook.

## 4. Set background-work recovery objectives

Record a maximum acceptable oldest-event age and a measured catch-up rate for outbox. The template
disables its relay while the ledger still writes events; unpublished rows are retained. Enable a
consumer/relay only with Kafka configuration and replay/deduplication evidence. Test broker latency,
outage and recovery while API traffic competes for the same database pool.

Define maximum reconciliation lag and wallet revisit time. With the default limits, full scans of
several years may take months; bounded checkpoints protect resources but do not establish timely
audit coverage. Partitioned/parallel audit segments and verified immutable historical checkpoints
require a separate Economy design and actual database tests. A partial scan cannot be reported clean.

## 5. Rehearse failure and recovery

Document the accepted RPO (data loss bound) and RTO (recovery time) per journey before qualification.
Measure database failover and a restore from base backup plus continuous WAL/PITR on a separate
target; verify ledger/idempotency and account state after restore. Record backup age, restore
duration and regional failure coverage. A local `pg_dump` alone is not evidence of PITR or a useful
restore time for a multi-terabyte database.

Test abrupt gateway loss and automatic browser reconnect through expiry of the maximum supported
300-second connection lease. Test brief SFU disconnect, a missing joined webhook, delayed provider
observations and server timer enforcement. A crashed LiveKit node loses its hosted rooms; measure
client recovery separately from graceful draining. Two replicas and a PDB do not migrate active rooms.

Change realtime shard placement using the maintenance procedure in
[realtime-gateway § 7](../services/realtime-gateway.md#7-chia-shard-redis-theo-userid-mặt-phẳng-realtime).
The coordinator topology key must survive failover; do not delete it or replace the coordinator
while old gateways still serve traffic. Test rollback with the same drain/lease preconditions.

Store raw results with workload/configuration, data size, SHA/digests, timestamps, owner and run URL.
Use the reliability gate's required artifacts. Keep a release blocked when capacity, restore or
failure recovery has not been measured for that release and deployment.

## 6. Reproducible staging benchmark artifact

`.github/workflows/staging-reliability.yml` runs matching queue, matching-to-call setup and
Socket.IO signaling sequentially with constant VUs. It records p95/p99 in milliseconds, sample
counts, error rates, native k6 threshold results and complete raw summaries/logs in
`staging-reliability-<run-id>-<attempt>`. `benchmark.json` links those results to the full commit,
workload defaults, generator, observed deployment and its SHA-256 hash. These short scenarios are
an initial benchmark, not the steady/peak/soak qualification above or a media throughput test.

Before dispatch, provision a dedicated staging target and set its `staging` GitHub environment
variables `STAGING_API_URL` and `STAGING_SIGNALING_URL`. Use TLS load-balancer endpoints whose
hostnames identify staging. Do not relabel the hosted-free alpha/demo as staging. Checked-in
Kubernetes manifests alone do not establish that a cluster is deployed or reachable. For recovery
qualification, provision at least two Core API and signaling replicas, compatible synthetic
matching profiles, telemetry access, an approved change ticket and an operator with scoped
deployment/fault permissions. The load runner does not provision infrastructure or inject faults.

Export a sanitized **live deployment observation** as `deployment.json` using this schema. Replace
every placeholder with observed values; timestamps must be within 24 hours and the SHA must equal
the deployed images. `configurationDigest` hashes the sanitized effective configuration saved at
`observationUrl`; `configurationProfile` describes worker intervals, queue/lease/quota settings,
enabled jobs, shard layout and relevant non-secret feature flags. Record database/index size and
synthetic account compatibility in `dataProfile`. Keep credentials, private data and secret values
out of this file: it becomes a retained CI artifact. The runner validates structure, freshness,
SHA and exact target URLs; provenance remains operator-supplied, not independently verified.

```json
{
  "environment": "staging",
  "gitSha": "FULL_40_CHARACTER_DEPLOYED_SHA",
  "observedAt": "LIVE_OBSERVATION_UTC_ISO_TIMESTAMP",
  "owner": "ACCOUNTABLE_OPERATOR",
  "observationUrl": "https://IMMUTABLE_DEPLOYMENT_OBSERVATION",
  "region": "ACTUAL_REGION_AND_FAILURE_DOMAINS",
  "targets": {
    "api": "https://staging.example.invalid",
    "signaling": "wss://staging-ws.example.invalid"
  },
  "configurationDigest": "sha256:64_LOWERCASE_HEX_CHARACTERS",
  "configurationProfile": "SANITIZED_EFFECTIVE_WORKER_QUOTA_AND_TOPOLOGY_SETTINGS",
  "dataProfile": "OBSERVED_SYNTHETIC_DATA_AND_INDEX_SIZE",
  "services": {
    "core-api": {
      "imageDigest": "sha256:64_LOWERCASE_HEX_CHARACTERS",
      "replicas": 2,
      "instanceClass": "ACTUAL_CLASS",
      "cpuLimit": "ACTUAL_CPU",
      "memoryLimit": "ACTUAL_MEMORY"
    },
    "signaling-gateway": {
      "imageDigest": "sha256:64_LOWERCASE_HEX_CHARACTERS",
      "replicas": 2,
      "instanceClass": "ACTUAL_CLASS",
      "cpuLimit": "ACTUAL_CPU",
      "memoryLimit": "ACTUAL_MEMORY"
    },
    "media-server": {
      "imageDigest": "sha256:64_LOWERCASE_HEX_CHARACTERS",
      "replicas": 1,
      "instanceClass": "ACTUAL_CLASS",
      "cpuLimit": "ACTUAL_CPU",
      "memoryLimit": "ACTUAL_MEMORY"
    }
  },
  "postgres": {
    "instanceClass": "ACTUAL_CLASS",
    "topology": "OBSERVED_PRIMARY_REPLICA_LAYOUT",
    "storageGiB": 20,
    "maxConnections": 100
  },
  "redis": {
    "instanceClass": "ACTUAL_CLASS",
    "topology": "OBSERVED_SHARDS_AND_FAILOVER",
    "memoryMiB": 512,
    "maxConnections": 100
  },
  "generator": {
    "instanceClass": "ACTUAL_RUNNER_CLASS",
    "topology": "OUTSIDE_SERVING_FLEET",
    "instances": 1,
    "region": "ACTUAL_REGION"
  }
}
```

Numeric values above illustrate the schema, not measured infrastructure. Use even VUs (at least
two) for paired calling. Dispatch only after the approved target and observation exist:

```powershell
$manifest = Get-Content -Raw ./deployment.json
gh workflow run staging-reliability.yml -f change_ticket=APPROVED_TICKET -f deployed_sha=FULL_SHA -f vus=20 -f duration=15m -f "deployment_manifest=$manifest"
```

The workflow definition selected for dispatch and the deployed commit must both contain this
tooling; checkout runs the scripts from the deployed SHA. Save the run URL and download the
artifact after completion. Missing summaries, unpopulated latency samples, missing p99, invalid
error rates, missing/unverified/failed threshold outcomes or any unsuccessful workload process
produce `status=FAIL`. A passing
benchmark always records gateway and worker recovery as `NOT_RUN` and capacity as
`NOT_QUALIFIED`. It cannot infer recovery from healthy requests or a successful benchmark.

Recovery requires a separate approved observation bound to the same SHA, deployment hash and
workload: fault start, detection and recovery timestamps; affected replica/worker; reconnect
success/error counts through the load balancer; worker backlog before/after and catch-up rate;
data-loss/duplicate checks; and immutable logs, pod events and dashboard links. Include the
accepted recovery objective and measured duration. Retain failed or unrun observations explicitly;
do not change `benchmark.json` recovery fields to PASS manually. Use the existing game-day and
multi-pod evidence procedure for production promotion.
