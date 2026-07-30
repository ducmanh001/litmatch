#!/usr/bin/env node

import {
  collectWorkspaceState,
  workspaceStateLines,
} from './workspace-state.mjs';

try {
  const root = process.env.AGENT_PROJECT_DIR || process.cwd();

  console.log('[agent-session] Định vị repo:');
  console.log(`- Repo: ${root}`);
  console.log(
    '- Đọc AGENTS.md; chạy pnpm agent:context <scope> trước khi sửa.',
  );
  console.log(
    '- Task không tầm thường: adaptive-orchestration. Module mới: new-module. Plan/verify: review-module.',
  );
  for (const line of workspaceStateLines(collectWorkspaceState(root), {
    includePaths: false,
  })) {
    console.log(line);
  }
  console.log('- Guard chung: pnpm agent:check; eval: pnpm agent:test.');
} catch {
  // Session context chỉ là hint và không được làm hỏng phiên nếu Git tạm thời không đọc được.
}
