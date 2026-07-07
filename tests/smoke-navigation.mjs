import { chromium } from "playwright";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:4180").replace(/\/$/, "");
const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";

const routes = [
  "/",
  "/?area=modules&view=processes",
  "/m/ddp?view=consult",
  "/m/ddp?view=new",
  "/?area=value-chain&view=value-chain-report",
];

function hasFallback(text) {
  return text.includes("Não foi possível carregar") || text.includes("Nao foi possivel carregar");
}

async function main() {
  const browser = await chromium.launch({ channel, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));

  await page.goto(`${baseUrl}/auth`, { waitUntil: "networkidle", timeout: 60000 });
  const demoButton = page.getByText(/Testar localmente sem login/i);
  if (await demoButton.count()) await demoButton.first().click();
  await page.waitForTimeout(1000);

  const results = [];
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(700);
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    results.push({
      route,
      url: page.url(),
      fallback: hasFallback(body),
      oldModules: body.includes("Módulos"),
      hasProcessLabel: body.includes("Processos"),
    });
  }

  await browser.close();

  const relevantLogs = logs.filter((line) => !line.includes("404"));
  const failures = results.filter((result) => result.fallback || result.oldModules);
  if (failures.length || relevantLogs.length) {
    console.error(JSON.stringify({ failures, relevantLogs }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, routes: results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
