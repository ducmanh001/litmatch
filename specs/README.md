# Contract artifacts

These files are source-derived companion contracts, not a second implementation source of truth.

- `critical-workflows.arazzo.yaml` uses Arazzo 1.1.0 and records only critical REST workflows
  whose operations are in `openapi/core-api.json`.
- `realtime.asyncapi.yaml` uses AsyncAPI 3.1.0 and records the Socket.IO/Redis fanout boundary
  whose event names are owned by `libs/common-dtos/src/lib/realtime-events.ts`.

Run `pnpm docs:check` after changing either artifact or the feature registry. It validates YAML,
the official schemas/parser, source-operation/event references, generated Markdown, and every DOCX
entry without a network call.
