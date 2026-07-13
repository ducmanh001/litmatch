import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * File cố định core-api's stdout được redirect vào (playwright.config.mts) — DevSmsProvider
 * in OTP dạng plaintext ra log thay vì gửi SMS thật (chỉ dev/test, chặn cứng ở production).
 * Không có backdoor API/DB đọc OTP — DB chỉ lưu codeHash (otp.service.ts).
 */
export const CORE_API_LOG = join(tmpdir(), 'litmatch-e2e-core-api.log');

const OTP_LOG_PATTERN = /Ma xac thuc Litmatch cua ban: (\d{6})/g;

/** Mã OTP MỚI NHẤT trong log — đủ cho flow tuần tự (1 request tại 1 thời điểm) của test này. */
export function readLatestOtpCode(): string | null {
  const content = readFileSync(CORE_API_LOG, 'utf8');
  const matches = [...content.matchAll(OTP_LOG_PATTERN)];
  return matches.length > 0 ? matches[matches.length - 1][1] : null;
}

export async function waitForLatestOtpCode(
  timeoutMs = 10_000,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const code = readLatestOtpCode();
    if (code !== null) return code;
    if (Date.now() > deadline) {
      throw new Error(
        `Không đọc được OTP từ ${CORE_API_LOG} sau ${timeoutMs}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}
