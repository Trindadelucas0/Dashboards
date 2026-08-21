const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUT = path.join(__dirname, "..", "docs", "compare");
const LEGACY = "http://localhost:4243";
const NOVA = process.env.NOVA_URL || "http://localhost:3000";
const ABAS = [
  "visao-geral",
  "compras",
  "finalidade",
  "vendas",
  "impostos",
  "memoria",
  "recebimentos",
  "dre",
  "indicadores",
  "balancete",
];

async function shot(page, url, file) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => null);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Legado
  await page.goto(LEGACY + "/", { waitUntil: "domcontentloaded" });
  const legacyPass = page.locator('input[type="password"]').first();
  if (await legacyPass.count()) {
    await page.locator('input[type="text"], input[name="username"]').first().fill("admin");
    await legacyPass.fill("1234");
    await page.locator('button[type="submit"], input[type="submit"]').first().click();
    await page.waitForTimeout(1000);
  }
  await shot(page, `${LEGACY}/`, "legacy-home.png");
  // tenta seletor / dashboard unica
  for (const route of ["/seletor", "/dashboard/unicatintas", "/unica", "/UNICATINTAS"]) {
    try {
      const res = await page.goto(LEGACY + route, { waitUntil: "domcontentloaded", timeout: 8000 });
      if (res && res.ok()) {
        await page.screenshot({ path: path.join(OUT, `legacy-route-${route.replace(/\W+/g, "_")}.png`), fullPage: true });
      }
    } catch (_) {}
  }

  // Nova
  await page.goto(NOVA + "/", { waitUntil: "networkidle" });
  await page.locator('input[type="text"], input[name="username"]').first().fill("admin");
  await page.locator('input[type="password"]').first().fill("1234");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForTimeout(1500);
  await shot(page, `${NOVA}/seletor`, "nova-seletor.png");
  for (const aba of ABAS) {
    await shot(page, `${NOVA}/dashboard/unicatintas/${aba}`, `nova-unica-${aba}.png`);
  }
  for (const aba of ["visao-geral", "compras", "vendas", "impostos", "finalidade"]) {
    await shot(page, `${NOVA}/dashboard/jpg/${aba}`, `nova-jpg-${aba}.png`);
  }

  fs.writeFileSync(
    path.join(OUT, "CHECKLIST.md"),
    `# Checklist visual — ${new Date().toISOString()}

## Ambientes
- Legado: ${LEGACY}
- Nova: ${NOVA}

## Critérios (ÚNICA = ouro)
| Aba | KPI | Charts | Tabelas | Status esperado pós-equalização |
|-----|-----|--------|---------|----------------------------------|
| Visão Geral | 4 (RB, Compras, Deduções, ICMS) | RB×deduções + % linha + composição + tabela impostos | sim | alinhado EJS |
| Compras | 3 | ranking + UF | ranking + Demais | alinhado |
| Finalidade | 4 macros | doughnut + barras | CFOP + drilldown | alinhado |
| Vendas | 3 | clientes + UF | ranking + CFOP + Demais | alinhado |
| Impostos | tax-grid | evolução + composição | — | layout ok; dados só com apuração |
| Memória | conferência + fórmulas | — | mem-cards | alinhado |
| Recebimentos | 3 | série mensal | — | proxy movimento |
| DRE | margin-grid | — | dre-tbl | parser RESULTADO |
| Indicadores | 4 | evolução % | — | alinhado |
| Balancete | placeholder/tabela | — | contas | sem inventar |

PNG gerados neste diretório.
`,
  );

  await browser.close();
  console.log("OK", OUT);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
