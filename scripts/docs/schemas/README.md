# Vendored specification schemas

`arazzo-1.1-2026-04-15.json` is the OpenAPI Initiative's published schema for Arazzo 1.1:

- Source: `https://spec.openapis.org/arazzo/1.1/schema/2026-04-15`
- Retrieved: 2026-07-24
- Local-file SHA-256 after repository formatting:
  `6b18a7f9b2cd56c71ad56f2fec2714befed831f1f96d664ba6296b14dc35ce90`
- Canonical JSON SHA-256 (`jq -S -c`), equal to the current upstream response:
  `44d35de8a59154087f0d749c8be88e408cbdeaa8cc40e7ba52262acd16fb4fa7`

`pnpm docs:check` verifies the local-file checksum before compiling the schema. Updating the schema
is therefore explicit: replace it from the authoritative URL, format it, verify the canonical
checksum against upstream, then update the pinned local checksum and this record in one review.
