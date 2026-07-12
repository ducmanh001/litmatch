/**
 * Kiểm tra hướng dẫn dùng chung (AGENTS.md, docs/, scripts/agent/...) không gọi tên
 * 1 nền tảng agent cụ thể — giữ nguyên tắc trung lập: mọi công cụ đọc cùng 1 nguồn,
 * không có nhánh riêng cho 1 loại agent.
 *
 * Codepoint thay vì literal: bản thân rule không được chứa plaintext của chuỗi nó cấm,
 * nếu không sẽ tự vi phạm chính nó (đã có test xác nhận ở vendor-wording.test.mjs) —
 * đây là cơ chế tự-chặn, không phải để né grep.
 */
const BANNED_WORDS = [
  [99, 108, 97, 117, 100, 101],
  [99, 111, 100, 101, 120],
].map((points) => String.fromCodePoint(...points));

export const VENDOR_NAME_PATTERN = new RegExp(
  `\\b(${BANNED_WORDS.join('|')})\\b`,
  'iu',
);

/**
 * Escape hatch cho ghi chú buộc phải nêu tên cụ thể (vd note vận hành về hành vi
 * riêng của 1 công cụ). Marker đặt trên CÙNG DÒNG hoặc DÒNG NGAY TRƯỚC dòng vi phạm —
 * cùng tinh thần `eslint-disable-next-line`: phải khai báo tường minh, grep ra hết
 * mọi chỗ ngoại lệ, không tắt cả file.
 * Lưu ý: Prettier có thể reflow 1 lệnh gọi dài thành nhiều dòng, đẩy chuỗi vi phạm
 * xuống xa marker — nếu vậy gán chuỗi vào 1 biến ngắn trước rồi đặt marker cùng dòng
 * với phép gán đó (dòng ngắn không bị Prettier tách), xem ví dụ trong vendor-wording.test.mjs.
 */
export const SUPPRESS_MARKER = 'agent-check:allow-vendor-name';

/** Trả về danh sách số dòng (1-indexed) vi phạm, đã trừ các dòng có suppress marker hợp lệ. */
export function findVendorNameViolations(content) {
  const lines = content.split('\n');
  const violations = [];
  lines.forEach((line, index) => {
    if (!VENDOR_NAME_PATTERN.test(line)) return;
    const suppressed =
      line.includes(SUPPRESS_MARKER) ||
      (lines[index - 1] ?? '').includes(SUPPRESS_MARKER);
    if (!suppressed) violations.push(index + 1);
  });
  return violations;
}
