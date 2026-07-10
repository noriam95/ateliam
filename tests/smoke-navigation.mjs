import http from "node:http";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:4180").replace(/\/$/, "");
const channel = process.env.PLAYWRIGHT_CHANNEL || "chrome";
const shouldStartServer = !process.env.BASE_URL;

const protectedRoutes = [
  "/",
  "/?area=modules&view=processes",
  "/?area=registrations&view=areas",
  "/m/ddp?view=consult",
  "/m/ddp?view=new",
  "/?area=value-chain&view=value-chain-report",
];

const forbiddenTexts = [
  "modulos",
  "mapeamentos pendentes",
  "processos & documentos em revisao",
  "versao do processo",
  "risco / ponto de atencao",
  "observacoes adicionais",
  "diagramas / imagens da etapa",
];

function hasFallback(text) {
  const normalized = normalizeText(text);
  return normalized.includes("nao foi possivel carregar");
}

function hasMojibake(text) {
  return /(?:\u00c3[\u0080-\u00bf]|\u00c2[\u0080-\u00bf])/u.test(text);
}

function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function isReachable(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.on("error", () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startLocalServerIfNeeded() {
  if (!shouldStartServer) return null;
  if (await isReachable(`${baseUrl}/auth`)) return null;

  const child = spawn("npm run dev -- --host 127.0.0.1 --port 4180", {
    shell: true,
    stdio: "ignore",
  });

  const ready = await waitForServer(`${baseUrl}/auth`);
  if (!ready) {
    child.kill();
    throw new Error(`Servidor local não respondeu em ${baseUrl}.`);
  }
  return child;
}

async function enterDemoIfAvailable(page) {
  await page.goto(`${baseUrl}/auth`, { waitUntil: "networkidle", timeout: 60000 });
  const demoButton = page.getByText(/Testar localmente sem login/i);
  if (await demoButton.count()) {
    await demoButton.first().click();
    await page.waitForTimeout(1000);
  }
  return !page.url().includes("/auth");
}

async function collectPageResult(page, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(700);
  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const normalizedBody = normalizeText(body);
  return {
    route,
    url: page.url(),
    fallback: hasFallback(body),
    forbidden: forbiddenTexts.filter((text) => normalizedBody.includes(text)),
    hasBadEncoding: hasMojibake(body),
    hasCanonicalLegacyArea:
      route.includes("area=registrations") ? page.url().includes("area=modules") : undefined,
    hasProcessLabel: normalizedBody.includes("processos"),
    hasMappingForm:
      route === "/m/ddp?view=new"
        ? normalizedBody.includes("processo do mapeamento") &&
          normalizedBody.includes("selecione um processo para comecar")
        : undefined,
    hasDashboardCards:
      route === "/"
        ? [
            "acompanhamento de mapeamentos",
            "catalogo e conformidade",
            "painel de atividade recente",
          ].every((text) => normalizedBody.includes(text))
        : undefined,
  };
}

async function runDesktopSmoke(browser, logs) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));

  const demoActive = await enterDemoIfAvailable(page);
  const results = [];
  for (const route of protectedRoutes) {
    results.push(await collectPageResult(page, route));
  }
  const processRegistration = demoActive ? await inspectProcessRegistrationDialog(page) : null;
  const registrationsNavigation = demoActive ? await inspectRegistrationsNavigation(page) : null;
  const mappingCreation = demoActive ? await inspectMappingCreationFlow(page) : null;
  await page.close();
  return { demoActive, results, processRegistration, registrationsNavigation, mappingCreation };
}

async function findInputByPlaceholder(page, expected) {
  const inputs = await page.locator("input").all();
  for (const input of inputs) {
    const placeholder = await input.getAttribute("placeholder");
    if (normalizeText(placeholder || "").includes(expected)) return input;
  }
  return null;
}

async function inspectProcessRegistrationDialog(page) {
  await page.goto(`${baseUrl}/?area=modules&view=processes`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(700);

  const newButtons = page.getByRole("button", { name: /^Novo$/i });
  if (!(await newButtons.count())) {
    return { opened: false, reason: "Botao Novo nao encontrado." };
  }
  await newButtons.last().click();
  await page.waitForTimeout(700);

  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const normalizedBody = normalizeText(body);
  const modalStart = normalizedBody.indexOf("novo processo");
  const modalText = modalStart >= 0 ? normalizedBody.slice(modalStart, modalStart + 1800) : "";
  const typeStart = modalText.indexOf("tipo");
  const typeBlock = typeStart >= 0 ? modalText.slice(typeStart, typeStart + 120) : "";

  return {
    opened: modalText.includes("novo processo"),
    hasParentMacroprocess: modalText.includes("macroprocesso pai"),
    hasOldValueChainField: modalText.includes("cadeia de valor"),
    hasMacroprocessTypeOption: typeBlock.includes("macroprocesso"),
    hasOwnerField: modalText.includes("dono do processo"),
    hasAreaField: modalText.includes("area"),
    hasBadEncoding: hasMojibake(body),
  };
}

async function inspectRegistrationsNavigation(page) {
  const results = [];
  for (const startRoute of ["/", "/m/ddp?view=consult"]) {
    await page.goto(`${baseUrl}${startRoute}`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    await page.waitForTimeout(700);

    if (startRoute === "/") {
      await page
        .getByRole("button", { name: /^Processos$/i })
        .first()
        .click();
      await page.waitForTimeout(300);
    }

    const cadastros = page.getByRole("button", { name: /Cadastros/i }).first();
    if (!(await cadastros.count())) {
      results.push({ startRoute, opened: false, reason: "Cadastros nao encontrado." });
      continue;
    }
    await cadastros.click();
    await page.waitForTimeout(300);
    const buttons = await page.getByRole("button").all();
    let clickedAreas = false;
    for (const button of buttons) {
      const label = normalizeText(await button.innerText().catch(() => ""));
      if (label.trim() === "areas") {
        await button.click();
        clickedAreas = true;
        break;
      }
    }
    if (!clickedAreas) {
      results.push({ startRoute, opened: false, reason: "Areas nao encontrado." });
      continue;
    }
    await page.waitForTimeout(700);
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const normalizedBody = normalizeText(body);
    const branches = await page.locator("[data-nav-branch]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        title: node.getAttribute("data-nav-branch") || "",
        open: node.getAttribute("data-open") === "true",
      })),
    );
    const normalizedBranches = Object.fromEntries(
      branches.map((branch) => [normalizeText(branch.title), branch.open]),
    );
    results.push({
      startRoute,
      url: page.url(),
      canonical: page.url().includes("area=modules") && page.url().includes("view=areas"),
      hasAreasTitle: normalizedBody.includes("areas"),
      hasOnlyRegistrationsOpen:
        normalizedBranches.cadastros === true &&
        normalizedBranches.mapeamento === false &&
        normalizedBranches.documentacao === false &&
        normalizedBranches.fluxograma === false,
      hasBadEncoding: hasMojibake(body),
      fallback: hasFallback(body),
      forbidden: forbiddenTexts.filter((text) => normalizedBody.includes(text)),
    });
  }
  return results;
}

async function inspectMappingCreationFlow(page) {
  await page.goto(`${baseUrl}/m/ddp?view=new`, {
    waitUntil: "networkidle",
    timeout: 60000,
  });
  await page.waitForTimeout(700);

  const initialBody = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const normalizedInitialBody = normalizeText(initialBody);
  const processInput = await findInputByPlaceholder(page, "selecione o processo");
  if (!processInput) return { opened: false, reason: "Campo de processo nao encontrado." };

  await processInput.click();
  await page.waitForTimeout(300);
  const firstOption = page.locator(".absolute.z-30 button").first();
  if (!(await firstOption.count())) {
    return { opened: true, optionFound: false };
  }
  await firstOption.click();
  await page.waitForTimeout(700);

  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const normalizedBody = normalizeText(body);
  const inputs = await page.locator("input").evaluateAll((nodes) =>
    nodes.map((node) => ({
      placeholder: node.getAttribute("placeholder") || "",
      value: node.value || "",
    })),
  );
  const blankFields = inputs
    .filter((input) =>
      ["pesquise um usuario cadastrado"].some((placeholder) =>
        normalizeText(input.placeholder).includes(placeholder),
      ),
    )
    .every((input) => input.value === "");
  const processInputIndex = inputs.findIndex((input) =>
    normalizeText(input.placeholder).includes("selecione o processo"),
  );
  const titleFieldBlank =
    processInputIndex >= 0 &&
    inputs.slice(processInputIndex + 1).some((input) => input.placeholder === "" && input.value === "");

  return {
    opened: true,
    optionFound: true,
    initiallyBlocked: normalizedInitialBody.includes("selecione um processo para comecar"),
    initiallyZero: normalizedInitialBody.includes("preench.\n0%"),
    selected: normalizedBody.includes("indice do relatorio"),
    enabled: normalizedBody.includes("dados do mapeamento"),
    hasProcessCode: inputs.some((input) => input.value === "Gestão de Demandas de BI Analytics"),
    hasValueChain: normalizedBody.includes("abrangencia / escopo"),
    hasArea: inputs.some((input) => input.value === "Tecnologia da Informação"),
    hasOwner: inputs.some((input) => input.value === "Dono do processo"),
    blankMappingFields: blankFields && titleFieldBlank,
    hasBadEncoding: hasMojibake(body),
    fallback: hasFallback(body),
    forbidden: forbiddenTexts.filter((text) => normalizedBody.includes(text)),
  };
}

async function runMobileSmoke(browser, logs) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`);
  });
  page.on("pageerror", (error) => logs.push(`pageerror: ${error.message}`));

  let demoActive = await enterDemoIfAvailable(page);
  if (!demoActive && shouldStartServer) {
    await page.goto(`${baseUrl}/auth`, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate(() => window.localStorage.setItem("atelier_demo_session", "1"));
    demoActive = true;
  }
  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(700);
  const body = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  const normalizedBody = normalizeText(body);
  await page.close();

  return {
    demoActive,
    url: page.url(),
    fallback: hasFallback(body),
    forbidden: forbiddenTexts.filter((text) => normalizedBody.includes(text)),
    hasBadEncoding: hasMojibake(body),
    authVisible: normalizedBody.includes("entrar no workspace"),
    dashboardVisible:
      normalizedBody.includes("visao operacional") || normalizedBody.includes("pagina inicial"),
  };
}

async function main() {
  const server = await startLocalServerIfNeeded();
  const browser = await chromium.launch({ channel, headless: true });
  const logs = [];

  try {
    const desktop = await runDesktopSmoke(browser, logs);
    const mobile = await runMobileSmoke(browser, logs);
    const relevantLogs = logs.filter((line) => !line.includes("404"));

    const routeFailures = desktop.results.filter((result) => {
      if (result.fallback || result.forbidden.length || result.hasBadEncoding) return true;
      if (desktop.demoActive && result.hasCanonicalLegacyArea === false) return true;
      if (desktop.demoActive && result.route === "/" && !result.hasDashboardCards) return true;
      if (desktop.demoActive && result.route === "/m/ddp?view=new" && !result.hasMappingForm) {
        return true;
      }
      return false;
    });
    const processRegistrationFailure =
      desktop.demoActive &&
      (!desktop.processRegistration?.opened ||
        !desktop.processRegistration.hasParentMacroprocess ||
        desktop.processRegistration.hasOldValueChainField ||
        desktop.processRegistration.hasMacroprocessTypeOption ||
        !desktop.processRegistration.hasOwnerField ||
        !desktop.processRegistration.hasAreaField ||
        desktop.processRegistration.hasBadEncoding);
    const registrationsNavigationFailures =
      desktop.demoActive && desktop.registrationsNavigation
        ? desktop.registrationsNavigation.filter(
            (result) =>
              !result.canonical ||
              !result.hasAreasTitle ||
              !result.hasOnlyRegistrationsOpen ||
              result.hasBadEncoding ||
              result.fallback ||
              result.forbidden?.length,
          )
        : [];
    const mappingCreationFailure =
      desktop.demoActive &&
      (!desktop.mappingCreation?.opened ||
        !desktop.mappingCreation.optionFound ||
        !desktop.mappingCreation.initiallyBlocked ||
        !desktop.mappingCreation.initiallyZero ||
        !desktop.mappingCreation.selected ||
        !desktop.mappingCreation.enabled ||
        !desktop.mappingCreation.hasProcessCode ||
        !desktop.mappingCreation.hasValueChain ||
        !desktop.mappingCreation.hasArea ||
        !desktop.mappingCreation.hasOwner ||
        !desktop.mappingCreation.blankMappingFields ||
        desktop.mappingCreation.hasBadEncoding ||
        desktop.mappingCreation.fallback ||
        desktop.mappingCreation.forbidden?.length);
    const mobileFailure =
      mobile.fallback ||
      mobile.forbidden.length > 0 ||
      mobile.hasBadEncoding ||
      (mobile.demoActive ? !mobile.dashboardVisible : !mobile.authVisible);

    if (
      routeFailures.length ||
      processRegistrationFailure ||
      registrationsNavigationFailures.length ||
      mappingCreationFailure ||
      mobileFailure ||
      relevantLogs.length
    ) {
      console.error(
        JSON.stringify(
          {
            routeFailures,
            processRegistration: desktop.processRegistration,
            registrationsNavigationFailures,
            mappingCreation: desktop.mappingCreation,
            mobile,
            relevantLogs,
          },
          null,
          2,
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(JSON.stringify({ ok: true, desktop, mobile }, null, 2));
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
