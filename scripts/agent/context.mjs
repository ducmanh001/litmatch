#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  collectWorkspaceState,
  workspaceStateLines,
} from './workspace-state.mjs';

const root = new URL('../../', import.meta.url);
const rootPath = fileURLToPath(root);
const map = JSON.parse(
  readFileSync(new URL('.agents/context-map.json', root), 'utf8'),
);
const scope = process.argv[2] ?? 'default';
const entry = map[scope];

if (!entry) {
  console.error(
    `Unknown scope "${scope}". Available: ${Object.keys(map).join(', ')}`,
  );
  process.exit(1);
}

console.log(`# Agent context — ${scope}`);
console.log(`\n${entry.description}`);
console.log('\n## Task contract');
console.log('- Objective:');
console.log('- Out of scope:');
console.log('- Acceptance criteria:');
console.log('- Risk/invariants:');
console.log('\n## Shared-workspace safety');
for (const line of workspaceStateLines(collectWorkspaceState(rootPath))) {
  console.log(line);
}
console.log('\n## Read first');
for (const path of entry.read ?? []) console.log(`- ${path}`);

if (entry.readWhen?.length) {
  console.log('\n## Read when applicable');
  for (const item of entry.readWhen) {
    console.log(`- ${item.path} — ${item.when}`);
  }
}

if (entry.paths?.length) {
  console.log('\n## Expected paths');
  for (const path of entry.paths) console.log(`- ${path}`);
}
if (entry.invariants?.length) {
  console.log('\n## Invariants');
  for (const invariant of entry.invariants) console.log(`- ${invariant}`);
}

console.log('\n## Required checks');
for (const command of entry.checks ?? []) console.log(`- ${command}`);
