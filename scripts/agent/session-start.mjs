#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const root = process.env.AGENT_PROJECT_DIR || process.cwd();
  const roadmap = readFileSync(join(root, 'docs/07-roadmap.md'), 'utf8').split(
    '\n',
  );
  // Track FE chạy song song, không thuộc số Giai đoạn backend (docs/07) — báo riêng,
  // không để nó cướp dòng "Giai đoạn hiện tại" của backend dù nó đứng trước trong file.
  const FRONTEND_TRACK_HEADING =
    'Frontend track (song song, không thuộc số Giai đoạn backend)';

  let heading;
  let phase;
  const unchecked = [];
  const frontendUnchecked = [];

  for (const line of roadmap) {
    if (/^#{2,3}\s/u.test(line)) heading = line.replace(/^#+\s*/u, '').trim();
    if (/^\s*-\s*\[ \]/u.test(line)) {
      const item = line.replace(/^\s*-\s*\[ \]\s*/u, '').trim();
      if (heading !== FRONTEND_TRACK_HEADING) phase ??= heading;
      if (heading === phase && unchecked.length < 5) unchecked.push(item);
      if (heading === FRONTEND_TRACK_HEADING && frontendUnchecked.length < 5) {
        frontendUnchecked.push(item);
      }
    }
  }

  console.log('[agent-session] Định vị repo:');
  console.log(
    `- Giai đoạn hiện tại (backend): ${phase ?? 'kiểm tra docs/07-roadmap.md'}`,
  );
  for (const item of unchecked) console.log(`  • [ ] ${item}`);
  console.log(
    `- Frontend track: ${frontendUnchecked.length > 0 ? 'đang làm' : 'chưa có việc tồn đọng hiển thị được — xem docs/07 § Frontend track'}`,
  );
  for (const item of frontendUnchecked) console.log(`  • [ ] ${item}`);
  console.log(
    '- Đọc AGENTS.md; chạy pnpm agent:context <scope> trước khi sửa.',
  );
  console.log(
    '- Task không tầm thường: adaptive-orchestration. Module mới: new-module. Plan/verify: review-module.',
  );
  console.log('- Guard chung: pnpm agent:check; eval: pnpm agent:test.');
} catch {
  // Session context không được làm hỏng phiên nếu roadmap tạm thời không đọc được.
}
