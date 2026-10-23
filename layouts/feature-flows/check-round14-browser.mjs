import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(
  here,
  process.argv.find((a) => a.startsWith('--out='))?.slice(6) ??
    'review/round14',
);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.LITMATCH_BROWSER ??
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
});
const results = [];
try {
  for (const [name, viewport] of [
    ['desktop', { width: 1440, height: 1000 }],
    ['mobile', { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      pathToFileURL(
        path.join(here, 'code/04-party-room/01-post-join-room.html'),
      ).href,
    );
    const width = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert.ok(
      width.document <= width.viewport,
      `${name}: page overflow ${JSON.stringify(width)}`,
    );
    const wasWrapped = await page
      .locator('.src')
      .evaluate((node) => node.classList.contains('wrap'));
    await page.locator('#wrap').click();
    const isWrapped = await page
      .locator('.src')
      .evaluate((node) => node.classList.contains('wrap'));
    assert.equal(isWrapped, !wasWrapped);
    if (!isWrapped) await page.locator('#wrap').click();
    await page.screenshot({
      path: path.join(output, `party-room-${name}.png`),
    });
    const stepLink = page.locator('.step-link').first();
    if (await stepLink.count()) {
      await stepLink.click();
      const anchor = new URL(page.url()).hash;
      assert.ok(/^#L\d+$/.test(anchor));
      assert.ok((await page.locator(anchor).innerText()).includes('Step 1:'));
    }
    const service = page
      .locator('.nhead')
      .filter({ hasText: 'PartyRoomService.joinRoom' })
      .first();
    await service.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(output, `party-room-${name}-service.png`),
    });
    await page.locator('#theme').click();
    assert.equal(errors.length, 0, errors.join('\n'));
    results.push({
      viewport: name,
      width,
      errors,
      screenshots: [`party-room-${name}.png`, `party-room-${name}-service.png`],
    });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  path.join(output, 'browser-check.json'),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  'Desktop/mobile: PASS; wrap/theme controls: PASS; browser errors: 0.',
);
