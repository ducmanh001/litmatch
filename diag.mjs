import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const BASE_URL = 'http://localhost:4300';
const PHONE = '912345678';

function readLatestOtp() {
  const logs = execSync('docker logs litmatch-core-api-1 --tail 200', {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });
  const matches = [...logs.matchAll(/Ma xac thuc Litmatch cua ban: (\d{6})/g)];
  return matches[matches.length - 1][1];
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();

await page.goto(`${BASE_URL}/login`);
await page.locator('#phone').fill(PHONE);
await page.getByRole('button', { name: 'Gửi mã OTP' }).click();
const otpDigitInputs = page.locator('input[inputmode="numeric"]');
await otpDigitInputs.first().waitFor({ timeout: 15000 });
await page.waitForTimeout(500);
const code = readLatestOtp();
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
