import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * Golden-bug fixtures — mỗi file là 1 lỗi logic nghiệp vụ THẬT lấy từ docs/10 § 10.2
 * (docs/05 § 5.1 "AI-native engineering": eval cho tầng review, không phải test code sản phẩm).
 * Đây là tầng MIỄN PHÍ (không gọi LLM) của eval: đảm bảo thư viện fixture còn nguyên vẹn và
 * còn khớp với docs/10 hiện tại. Muốn thật sự kiểm tra xem `/review-module` (agent) có bắt được
 * từng lỗi này không thì phải chạy tay, tốn token — không nằm trong agent:test/CI (quyết định
 * cần chấp nhận chi phí, chưa làm — xem docs/11 hoặc hỏi lại khi cần).
 */
const dir = fileURLToPath(new URL('./golden-bugs/', import.meta.url));

const REQUIRED_FIELDS = [
  'id',
  'module',
  'docsRef',
  'description',
  'buggyCode',
  'whyWrong',
];

export function loadGoldenBugs() {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  return files.map((file) => {
    const raw = readFileSync(join(dir, file), 'utf8');
    let bug;
    try {
      bug = JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `golden-bugs/${file}: JSON không hợp lệ — ${err.message}`,
      );
    }
    const missing = REQUIRED_FIELDS.filter(
      (key) => !bug[key] || typeof bug[key] !== 'string' || !bug[key].trim(),
    );
    if (missing.length) {
      throw new Error(`golden-bugs/${file}: thiếu field ${missing.join(', ')}`);
    }
    if (bug.id !== file.replace(/\.json$/u, '')) {
      throw new Error(
        `golden-bugs/${file}: field "id" (${bug.id}) phải khớp tên file`,
      );
    }
    return { file, ...bug };
  });
}
