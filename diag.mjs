import 'dotenv/config';

import { chromium } from '@playwright/test';

const BASE_URL =
  process.env['DIAG_BASE_URL'] ??
  process.env['BASE_URL'] ??
  'http://localhost:4300';
const PHONE = process.env['DIAG_PHONE_LOCAL'] ?? '912345678';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

await page.goto(`${BASE_URL}/login`);
await page.locator('#phone').fill(PHONE);
const otpResponsePromise = page.waitForResponse((response) =>
  response.url().includes('/api/v1/auth/otp/request'),
);
await page.getByRole('button', { name: 'Gửi mã OTP' }).click();
const otpDigitInputs = page.locator('input[inputmode="numeric"]');
await otpDigitInputs.first().waitFor({ timeout: 15000 });
const otpResponse = await otpResponsePromise;
const otpPayload = await otpResponse.json();
const code = otpPayload.data.code;
for (const [index, digit] of [...code].entries()) {
  await otpDigitInputs.nth(index).fill(digit);
}
await page.getByRole('button', { name: 'Đăng nhập' }).click();
await page.waitForURL(/\/home$/, { timeout: 15000 });

await page.goto(`${BASE_URL}/discovery`);
await page.waitForSelector('text=Hẹn hò có chủ đích', { timeout: 15000 });
await page.waitForTimeout(500);

const info = await page.evaluate(() => {
  const html = document.documentElement;
  const el = [...document.querySelectorAll('h1, p')].find((n) =>
    n.textContent?.includes('Hẹn hò có chủ đích'),
  );
  const cs = el ? getComputedStyle(el) : null;
  return {
    htmlClass: html.className,
    htmlDataTheme: html.getAttribute('data-theme'),
    elClass: el?.className,
    color: cs?.color,
    background: cs?.backgroundImage || cs?.backgroundColor,
    borderColor: cs?.borderColor,
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
