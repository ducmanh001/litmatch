#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const root = process.env.AGENT_PROJECT_DIR || process.cwd();
  const roadmap = readFileSync(join(root, 'docs/07-roadmap.md'), 'utf8').split(
    '\n',
  );
  let heading;
  let phase;
  const unchecked = [];

  for (const line of roadmap) {
    if (/^#{2,3}\s/u.test(line)) heading = line.replace(/^#+\s*/u, '').trim();
    if (/^\s*-\s*\[ \]/u.test(line)) {
      phase ??= heading;
      if (heading === phase && unchecked.length < 5) {
        unchecked.push(line.replace(/^\s*-\s*\[ \]\s*/u, '').trim());
      }
    }
  }

  console.log('[agent-session] Định vị repo:');
  console.log(
    `- Giai đoạn hiện tại: ${phase ?? 'kiểm tra docs/07-roadmap.md'}`,
  );
  for (const item of unchecked) console.log(`  • [ ] ${item}`);
  console.log(
    '- Đọc AGENTS.md; chạy pnpm agent:context <scope> trước khi sửa.',
  );
  console.log('- Module mới: new-module. Plan/verify: review-module.');
  console.log('- Guard chung: pnpm agent:check; eval: pnpm agent:test.');
} catch {
  // Session context không được làm hỏng phiên nếu roadmap tạm thời không đọc được.
}
