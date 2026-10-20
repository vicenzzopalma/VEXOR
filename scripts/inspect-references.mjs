
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('docs/validation/references', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const results = [];
for (const [name, url] of [
  [
    'workflow-dribbble',
    'https://dribbble.com/shots/21100197-Workflow-builder-Support-journey-builder-Low-code-automation',
  ],
  ['edge-crm', 'https://crmedge.net/'],
  [
    'templates-dribbble',
    'https://dribbble.com/shots/27127142-AI-Automation-Workflow-Dashboard-Templates-Page',
  ],
  ['canva', 'https://www.canva.com/online-whiteboard/'],
]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.screenshot({
      path: `docs/validation/references/${name}.png`,
      fullPage: false,
      timeout: 15000,
    });
    const metadata = await page.evaluate(() => ({
      title: document.title,
      bodyTextLength: document.body.innerText.length,
      images: [...document.images]
        .filter((i) => i.width > 400)
        .map((i) => ({ src: i.currentSrc, width: i.width, height: i.height })),
      buttons: [...document.querySelectorAll('button')]
        .map((b) => b.textContent?.trim())
        .filter(Boolean)
        .slice(0, 30),
    }));
    results.push({ name, url, status: response?.status(), ...metadata });
    if (name === 'edge-crm') {
      const question = page.getByText('How does Edge CRM prevent missed follow-ups?', { exact: true });
      if (await question.count()) {
        await question.click();
        results[results.length - 1].faqClicked = true;
      }
      await page.screenshot({ path: `docs/validation/references/${name}-faq.png` });
    }
    console.log(name, response?.status(), metadata.title);
  } catch (error) {
    results.push({ name, url, error: error.message });
    console.log(name, error.message.slice(0, 150));
  }
  await page.close();
}
await writeFile('docs/validation/references/inspection.json', JSON.stringify(results, null, 2));
await browser.close();
