# 18. Product/spec documentation automation

This document defines the evidence-based documentation layer added after the product/spec audit.
It is deliberately a documentation and tooling boundary: it does not assert that a feature has
been run in production, and it does not replace the domain specifications or repository tests.

## 18.1 Canonical sources and status vocabulary

`docs/feature-registry.json` is the machine-readable index of code-backed product features. Each
record must have an explicit status, owner, public contract references, implementation evidence,
and a verification-evidence level. `implemented` means the listed source evidence exists in this
repository; it is not a production-verification claim. `automated-test-source` means a relevant
test source is present. `recordedChecks` preserves a supplied change-handoff result with its
source evidence and caveat; it is still not production verification.

The canonical source remains deliberately split by responsibility:

- Product intent: [01-product-features.md](./01-product-features.md).
- Architecture and module ownership: [03-architecture.md](./03-architecture.md) and
  [11-engineering-principles.md](./11-engineering-principles.md).
- Domain behavior: `docs/services/*.md` and [06-domain-rules.md](./06-domain-rules.md).
- API and realtime contracts: `openapi/core-api.json`,
  [`specs/critical-workflows.arazzo.yaml`](../specs/critical-workflows.arazzo.yaml), and
  [`specs/realtime.asyncapi.yaml`](../specs/realtime.asyncapi.yaml).

The generated report is a view of the registry, not another manually maintained status list. This
consolidates the old, stale README status paragraph into a link to one evidence source while
leaving product requirements and detailed domain specs in their existing owners.

## 18.2 Generate and validate

```bash
pnpm docs:generate
pnpm docs:check
```

The generator validates every evidence path and required text marker, then writes:

- `docs/generated/product-spec-evidence-report.md` — a human-readable report.
- `docs/generated/product-spec-evidence-report.docx` — the same report for future readers.

Generation is deterministic for a fixed registry: it uses sorted inputs, fixed document metadata,
and no current timestamp. `docs:check` validates the registry, parses Arazzo YAML against the
vendored official Arazzo 1.1 schema, validates AsyncAPI through the official parser, and fails when
the generated Markdown is stale. It also checks DOCX ZIP integrity, its exact normalized entry
list, and every generated XML entry, so a corrupt or older non-empty DOCX cannot pass.

The schema/parser checks run offline. The vendored Arazzo schema records its upstream schema ID and
revision in `scripts/docs/schemas/arazzo-1.1-2026-04-15.json`; updating it must be an explicit,
reviewable source change.

## 18.3 Audit decisions captured here

1. Prefer low-cost, deterministic repository tooling over a manual or AI-maintained feature
   inventory.
2. Do not delete product or domain specifications merely because their status is now indexed; they
   have different ownership. Only duplicate current-status prose was consolidated.
3. Record existing algorithm/database/cache choices and defer new cache/algorithm layers until
   production evidence justifies their complexity.
4. Keep one primary HTTP facade at a module root; place secondary resource controllers in
   `controllers/`. Matching invite and feed story controllers were migrated to that layout, and
   `apps/core-api/src/arch/module-layout.spec.ts` now enforces it deterministically.
5. Keep REST workflows and realtime transport descriptions as source-derived contracts, not
   speculative API designs.

`review-module: N/A` — this work changes documentation/specification automation only and does not
change a business flow.
