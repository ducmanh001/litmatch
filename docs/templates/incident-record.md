# Incident record template

Use this only for an operational event with primary evidence of user, security, data,
availability, or release impact. A local/test/review failure without that evidence uses the
[learning-record template](./learning-record.md) instead. Store links or redacted identifiers,
not secrets, personal data, access tokens, or raw production logs.

```markdown
# INC-YYYY-NNN — concise operational impact

- **Status**: declared | contained | monitoring | recovered | closed
- **Observed severity and basis**: project severity, or `provisional — <observed impact>`
- **Incident/operational owner**: named role/person
- **Closure authority**: named role/person
- **Coordination channel**: durable channel/link
- **Communication cadence / next update**: interval and timestamp
- **Detected / declared / recovered / closed at**: ISO-8601 timestamps or `pending`
- **Primary evidence**: alert, trace/correlation IDs, release SHA, or redacted evidence link

## Observed and suspected impact

Separate confirmed users/data/surfaces/time window from hypotheses. State unknowns explicitly.

## Timeline and decisions

Timestamp each material observation, containment decision, owner change, stakeholder/user update,
rollback/forward action, and reason.

## Containment and recovery

Record the authorized action, exact artifact/config scope, rollback/forward path, and recovery
signal. Do not rewrite migrations or ledger history to conceal impact.

## Root cause / contributing factors

Separate verified cause from hypotheses. Link the smallest reproducible evidence.

## Verification and communications

Record relevant tests/smoke checks and the operational signal confirming recovery. Link the final
stakeholder/user update and state unresolved risk.

## Learning and follow-ups

Link the canonical doc/ADR/runbook/test changes, owner + due trigger, and reusable
`LRN-YYYY-NNN` entry when evidence meets the lessons-registry bar.
```
