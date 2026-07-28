# Historical handoff — analytics privacy and short-video reporting — 2026-07-24

This note preserves a supplied repository-test handoff after the source behavior was later
superseded. It is historical evidence, not current product behavior and not a production
verification claim.

## Recorded result

- Result: **14 tests passed on 2026-07-24**.
- Command:
  `NX_DAEMON=false nx test web --run src/shared/analytics/product-analytics.spec.ts src/shared/analytics/product-analytics-components.spec.tsx src/features/short-video/components/video-reel-feed.spec.tsx`
- Original scope: consent-gated/masked analytics and a visible short-video report action.

## Superseded behavior

- Analytics now initializes and opts in whenever PostHog env is configured; autocapture and
  unmasked replay are explicit in the current source/test. The current operator warning lives in
  [PostHog runbook](../runbooks/posthog-cloud.md).
- The short-video report API/backend remain, but the visible reel action is absent and its test
  asserts that absence. The current feature registry classifies the UI as deferred.

Use `docs/feature-registry.json` plus `pnpm docs:check` for current code-backed status. Do not use
the recorded command result above to infer current privacy behavior, current UI behavior, vendor
ingestion, browser RUM, or production verification.
