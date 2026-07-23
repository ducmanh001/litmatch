import { expect, test } from '@playwright/test';

/**
 * Bằng chứng browser E2E thật bắt buộc theo ADR 0003/0007 (docs/13 § 13.12 — trigger dựng
 * Playwright là có flow login + 1 flow nghiệp vụ thật). Xác nhận cookie httpOnly refresh_token
 * (ADR 0007) sống sót qua reload và CSRF double-submit hoạt động đúng ở tầng browser thật,
 * không chỉ unit/HTTP-level test.
 */
test('đăng nhập OTP, session sống sót qua reload, vào hàng đợi ghép đôi', async ({
  page,
}) => {
  await page.goto('/login');

  // #phone chỉ nhận phần nội địa (không có tiền tố +84 — badge quốc gia là span riêng, đúng
  // layouts/web/login.html) — normalizeVnPhone() mới ghép +84 vào trước khi gửi lên server.
  const phone = '90' + String(Date.now()).slice(-7);
  await page.locator('#phone').fill(phone);
  const otpResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/v1/auth/otp/request'),
  );
  await page.getByRole('button', { name: 'Gửi mã OTP' }).click();

  // Ô nhập OTP là 6 input rời (mỗi ô 1 chữ số, đúng mockup) — không còn input ẩn #code.
  const otpDigitInputs = page.locator('input[inputmode="numeric"]');
  await otpDigitInputs.first().waitFor();
  const otpResponse = await otpResponsePromise;
  const otpPayload = await otpResponse.json();
  const code: string = otpPayload.data.code;
  await expect(page.getByText(/Mã OTP của bạn là \d{6}/u)).toBeVisible();
  for (const [index, digit] of [...code].entries()) {
    await expect(otpDigitInputs.nth(index)).toHaveValue(digit);
  }
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page).toHaveURL(/\/home$/);

  // Reload thật — wipe hết state JS (access token memory-only), chỉ còn cookie httpOnly
  // refresh_token + csrfToken persisted ở localStorage sống sót (ADR 0007). AuthGate phải tự
  // restore qua /auth/refresh trước khi cho vào trang cần đăng nhập.
  await page.goto('/matching');
  await expect(
    page.getByRole('heading', { name: 'Kết nối có chủ đích' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Bắt đầu ghép đôi Tâm hồn' }).click();

  await expect(page.getByText('Đang tìm người ghép đôi')).toBeVisible();

  // Chờ đúng 1 chu kỳ poll thật (refetchInterval 3s, api.ts) — assert vào status code, KHÔNG
  // phải text UI cụ thể: máy dev/CI có thể còn ticket "soul + any" từ lần chạy trước đang chờ
  // trong queue thật, nên 2 ticket có thể match NHAU giữa lúc test chạy (đúng hành vi nghiệp vụ,
  // không phải lỗi) — cái cần xác nhận cho ADR 0007 là request sau reload vẫn được xác thực
  // (200), không phải ticket còn 'queued' hay đã 'matched'.
  const pollResponse = await page.waitForResponse((res) =>
    res.url().includes('/api/v1/matching/tickets/'),
  );
  expect(pollResponse.status()).toBe(200);
});
