#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { inspectChange, inspectCommand } from './guard-core.mjs';

const root = process.env.AGENT_PROJECT_DIR || process.cwd();

function tracked(filePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', filePath], {
      cwd: root,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const chunks = [];
process.stdin.on('data', (chunk) => chunks.push(chunk));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.exit(0);
  }

  const tool = String(input.tool_name ?? input.tool ?? '').toLowerCase();
  const toolInput = input.tool_input ?? input.input ?? {};
  let violations = [];

  if (/bash|shell|exec_command/u.test(tool)) {
    violations = inspectCommand(
      String(toolInput.command ?? toolInput.cmd ?? ''),
    );
  } else if (/write|edit|apply_patch/u.test(tool)) {
    const filePath = String(toolInput.file_path ?? toolInput.path ?? '');
    const content = String(
      toolInput.content ?? toolInput.new_string ?? toolInput.patch ?? '',
    );
    const operation =
      /edit|apply_patch/u.test(tool) || existsSync(filePath)
        ? 'modify'
        : 'create';
    violations = inspectChange({
      filePath,
      content,
      operation,
      tracked: tracked(filePath),
    });
  }

  if (violations.length) {
    console.error(`BLOCKED (agent guard):\n- ${violations.join('\n- ')}`);
    process.exit(2);
  }
  process.exit(0);
});
