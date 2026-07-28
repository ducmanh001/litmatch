# Learning record template

Copy this template into an appropriate dated plan/review or summarize it as one row in
[`docs/reference/lessons-registry.md`](../reference/lessons-registry.md). Do not store secrets,
personal data, raw production logs, or unsupported production claims.

```markdown
## LRN-YYYY-NNN — concise title

- **Status**: proposed | active | monitoring | closed | superseded
- **Owner**: team/role or `unassigned`
- **Date recorded**: YYYY-MM-DD
- **Classification**: fact | historical evidence | inferred risk | deferred work
- **Primary evidence**: relative path or URL — commit/test/plan/alert reference
- **Related canonical rule**: document path and section, or `none`

### Symptom and impact

Observed symptom; separate confirmed impact from suspected impact.

### Root cause or hypothesis

Verified cause, or state why it remains a hypothesis.

### Guard / prevention

Code guard, process step, test, runbook, or follow-up owner. Link the implementation.

### Verification

Exact test/check/smoke evidence and its result. State any remaining limitation.
```
