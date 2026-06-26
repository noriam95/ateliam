import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Go to auth, activate demo mode
await page.goto('http://localhost:3000/auth', { waitUntil: 'networkidle', timeout: 15000 });
await page.locator('button:has-text("Testar localmente")').click();
await page.waitForURL('http://localhost:3000/', { timeout: 10000 });
await page.waitForTimeout(3000);

console.log('URL:', page.url());
console.log('ERRORS_SO_FAR:', JSON.stringify(errors));

// Check if workspace content rendered
const sidebarLinks = await page.locator('nav a, nav button, [role=navigation] button').count();
console.log('SIDEBAR_ITEMS:', sidebarLinks);

// Take screenshot to see what rendered
await page.screenshot({ path: '/tmp/workspace.png', fullPage: false });

// Try clicking something in the sidebar
const buttons = await page.locator('button').allTextContents();
console.log('ALL_BUTTONS:', JSON.stringify(buttons.slice(0, 10)));

await browser.close();
