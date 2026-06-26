import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => { console.log('PAGEERROR:', e.message); errors.push(e.message); });
page.on('console', m => { if (m.type() === 'error') { console.log('CONSOLE_ERR:', m.text().slice(0, 200)); } });

await page.goto('http://localhost:3000/auth', { waitUntil: 'networkidle', timeout: 15000 });
await page.locator('button:has-text("Testar localmente")').click();
await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
await page.waitForTimeout(5000);

console.log('URL:', page.url());
const body = await page.locator('body').innerHTML();
console.log('BODY_LENGTH:', body.length);
console.log('BODY_PREVIEW:', body.slice(0, 500));

await browser.close();
