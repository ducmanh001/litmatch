#!/usr/bin/env node

import { loadGoldenBugs } from './golden-bugs.mjs';

/**
 * Tầng TOOL (deterministic, miễn phí) của eval golden-bugs — chỉ lắp prompt review MÙ
 * (không kèm `whyWrong`/`description`) từ mỗi fixture. Tầng phán đoán thật ("agent review
 * có bắt được bug này không") là AI — phải giao cho Agent tool ở nơi gọi script này,
 * không thuộc script (docs/08 § "Eval golden-bugs" — chấp nhận chi phí LLM thật, không
 * nằm trong CI/agent:test).
 */
const moduleFilter = process.argv[2]?.replace(/^--module=/u, '');

const bugs = loadGoldenBugs().filter(
  (b) => moduleFilter === undefined || b.module === moduleFilter,
);

for (const bug of bugs) {
  console.log(`### ${bug.id}`);
  console.log(
    'Review đoạn code sau theo phương pháp luận docs/10 § 10.0 (không đọc code base, ' +
      'chỉ dựa trên đoạn này): chỉ ra bug logic nghiệp vụ nếu có, giải thích ngắn gọn vì sao sai.\n',
  );
  console.log('```ts');
  console.log(bug.buggyCode);
  console.log('```\n');
}

if (bugs.length === 0) {
  console.error(`Không có fixture nào khớp module "${moduleFilter}"`);
  process.exit(1);
}
