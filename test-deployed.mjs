import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});
const page = await browser.newPage();
const errors = [];
const netErrors = [];

page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('response', r => { if (r.status() >= 400) netErrors.push(r.status() + ' ' + r.url()); });

console.log('Loading /auth...');
await page.goto('http://localhost:3000/auth', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);

console.log('TITLE:', await page.title());
console.log('URL:', page.url());
console.log('CONSOLE_ERRORS:', JSON.stringify(errors, null, 2));
console.log('NET_ERRORS:', JSON.stringify(netErrors, null, 2));

// Test interactivity
const emailInput = page.locator('input[type=email]');
const count = await emailInput.count();
console.log('EMAIL_INPUT_COUNT:', count);

if (count > 0) {
  await emailInput.click();
  await emailInput.fill('test@example.com');
  const val = await emailInput.inputValue();
  console.log('EMAIL_INTERACTIVE:', val === 'test@example.com' ? 'YES' : 'NO - got: ' + val);

  await page.locator('input[type=password]').fill('wrongpassword');

  // Capture errors after click
  const errsBefore = errors.length;
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(3000);

  console.log('URL_AFTER_SUBMIT:', page.url());
  console.log('NEW_ERRORS_AFTER_SUBMIT:', JSON.stringify(errors.slice(errsBefore), null, 2));

  // Check for toast notifications
  const toasts = await page.locator('[data-sonner-toast]').count();
  console.log('TOAST_COUNT:', toasts);
  if (toasts > 0) {
    const toastText = await page.locator('[data-sonner-toast]').first().textContent();
    console.log('TOAST_TEXT:', toastText);
  }
}

await browser.close();
