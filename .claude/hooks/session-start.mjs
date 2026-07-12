#!/usr/bin/env node
/**
 * SessionStart hook — in định vị nhanh cho agent đầu mỗi phiên (stdout được nạp vào context):
 * giai đoạn roadmap hiện tại + vài mục chưa tick + nhắc bộ công cụ gen chuẩn.
 * Chỉ đọc file, không side-effect; lỗi gì cũng exit 0 để không bao giờ chặn phiên.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

try {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const roadmap = readFileSync(join(root, 'docs/07-roadmap.md'), 'utf8').split(
    '\n',
  );

  let currentPhase = null;
  let lastHeading = null;
  const unchecked = [];
  for (const line of roadmap) {
    if (/^#{2,3}\s/.test(line)) lastHeading = line.replace(/^#+\s*/, '').trim();
    if (/^\s*-\s*\[ \]/.test(line)) {
      currentPhase ??= lastHeading;
      if (lastHeading === currentPhase && unchecked.length < 5) {
        unchecked.push(line.replace(/^\s*-\s*\[ \]\s*/, '').trim());
      }
    }
  }

  const lines = [
    '[session-start] Định vị repo litmatch:',
    `- Giai đoạn hiện tại (mục chưa tick đầu tiên trong docs/07-roadmap.md): ${currentPhase ?? 'không tìm thấy mục chưa tick — kiểm tra roadmap'}`,
    ...unchecked.map((u) => `  • [ ] ${u}`),
    '- Module mới → dùng skill /new-module (khung + thứ tự sinh file cố định). Review → /review-module plan|verify.',
    '- Khung dùng chung: BaseAppEntity, @IdempotencyKey(), CursorPageQueryDto/buildCursorPage, DomainException + *.errors.ts.',
    '- Hook guard đang bật: cấm app thứ 4, cấm bật TypeORM synchronize, cấm sửa migration đã commit, cấm UPDATE/DELETE ledger_entries.',
  ];
  console.log(lines.join('\n'));
} catch {
  // im lặng — hook định vị không được phép làm hỏng phiên
}
process.exit(0);
