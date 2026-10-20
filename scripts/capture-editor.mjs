
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('docs/validation', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => console.log(e.stack));
page.on('console', (message) => {
  if (message.type() === 'error') console.log(message.text().slice(0, 7000));
});
await page.goto('http://localhost:3000/editor/starter-sdr');
await page.waitForSelector('.react-flow__node', { timeout: 15000 }).catch(() => {});
await page.screenshot({ path: 'docs/validation/editor-desktop.png' });
console.log('nodes', await page.locator('.react-flow__node').count());
console.log((await page.locator('body').innerText()).slice(-600));
for (const route of ['templates', 'processos', 'execucoes']) {
  await page.goto(`http://localhost:3000/${route}`);
  await page.locator('.listing-page').waitFor();
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `docs/validation/${route}-desktop.png` });
  console.log(
    route,
    'overflow',
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  );
}
await page.setViewportSize({ width: 1024, height: 768 });
await page.goto('http://localhost:3000/editor/starter-sdr');
await page.waitForSelector('.react-flow__node');
await page.screenshot({ path: 'docs/validation/editor-notebook.png' });
console.log(
  'notebook overflow',
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
);
await browser.close();
