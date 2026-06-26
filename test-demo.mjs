import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();

page.on('console', m => { if (['error','warn'].includes(m.type())) console.log('CONSOLE_' + m.type().toUpperCase() + ':', m.text()); });
page.on('pageerror', e => console.log('PAGEERROR:', e.message));

await page.goto('http://localhost:3000/auth', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(1000);

// Check demo mode button
const demoBtn = page.locator('button:has-text("Testar localmente")');
console.log('DEMO_BTN_COUNT:', await demoBtn.count());

await demoBtn.click();
await page.waitForTimeout(2000);

console.log('URL_AFTER_DEMO:', page.url());

// Check for toast
const toasts = await page.locator('[data-sonner-toast]').allTextContents();
console.log('TOASTS:', JSON.stringify(toasts));

await browser.close();
