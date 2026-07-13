/**
 * Gera PDF do Relatório por Fornecedor por empresa,
 * usando SOMENTE o dataset local de cada uma (sem misturar).
 */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const PDFDocument = require("pdfkit");

const root = path.join(__dirname, "..", "..");
const outDir = path.join(__dirname, "..", "relatorios", "fornecedores");
const TOP_N = 10;

const COMPANIES = [
  {
    id: "baifer",
    label: "BAIFER",
    file: path.join(root, "DASH", "BAIFER DASHBOARD", "data", "baifer-data.js"),
    kind: "dashboard",
  },
  {
    id: "du-lanche",
    label: "DU LANCHE",
    file: path.join(root, "DASH", "du lanches", "data", "du-lanche-data.js"),
    kind: "dashboard",
  },
  {
    id: "egaplast",
    label: "EGAPLAST",
    file: path.join(root, "egaplast att com cfop", "data", "egaplast-data.js"),
    kind: "dashboard",
  },
  {
    id: "unica",
    label: "UNICATINTAS",
    file: path.join(root, "UNICA 10", "data", "unica-data.js"),
    kind: "unica",
  },
  {
    id: "schumacher",
    label: "SCHUMACHER",
    file: path.join(root, "DASH", "shumacher", "data", "schumacher-data.js"),
    kind: "dashboard",
  },
  {
    id: "loja-maquinas",
    label: "LOJA MAQUINAS",
    file: path.join(root, "Dashboards", "src", "views", "loja-maquinas.ejs"),
    kind: "loja",
  },
  {
    id: "jpg",
    label: "JPG",
    file: path.join(root, "Dashboards", "src", "views", "jpg.ejs"),
    kind: "jpg",
  },
];

function fmtBRL(v) {
  return "R$ " + Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function loadJsData(filePath) {
  const code = fs.readFileSync(filePath, "utf8");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(code + "\n;this.__RESULT = (typeof DASHBOARD_DATA !== 'undefined') ? DASHBOARD_DATA : null;", sandbox);
  if (!sandbox.__RESULT) throw new Error("DASHBOARD_DATA nao encontrado em " + filePath);
  return sandbox.__RESULT;
}

function loadLojaFromEjs(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const empMatch = html.match(/const EMPRESA = (\{[\s\S]*?\n  \});/);
  const fiscalMatch = html.match(/const FISCAL_POR_MES = (\{[\s\S]*?\n  \});/);
  if (!empMatch || !fiscalMatch) throw new Error("EMPRESA/FISCAL_POR_MES nao encontrados em loja-maquinas");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(
    "const EMPRESA = " + empMatch[1] + ";\nconst FISCAL_POR_MES = " + fiscalMatch[1] + ";\nthis.__R = { EMPRESA, FISCAL_POR_MES };",
    sandbox
  );
  return sandbox.__R;
}

function loadJpgFromEjs(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const m = html.match(/const JPG_DATA = (\{[\s\S]*?\n\});\s*\n/);
  if (!m) throw new Error("JPG_DATA nao encontrado");
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext("const JPG_DATA = " + m[1] + ";\nthis.__R = JPG_DATA;", sandbox);
  return sandbox.__R;
}

function jpgCfopsToStandard(cfops) {
  return (cfops || []).map((c) => ({
    cfop: c.cfop,
    descricao: c.descricao,
    finalidade: c.finalidade,
    fornecedores: (c.parties || []).map((p) => ({
      nome: p.nome,
      cnpj: p.cnpj,
      uf: p.uf,
      qtd: p.qtd,
      total: p.total,
    })),
  }));
}

function getCfopList(data, kind) {
  if (kind === "unica") {
    const porMes = data.fiscalPorMes || {};
    const keys = Object.keys(porMes).sort();
    const last = keys[keys.length - 1];
    const pack = porMes[last] || {};
    return {
      cfops: pack.cfopDados || pack.cfopEntradas || [],
      competencia: pack.competenciaLabel || last || data.competenciaLabel || "—",
      catalog: data.cfopFinalidade || {},
    };
  }
  if (data.porMes || data.meses || data.units) {
    // BAIFER-style nested units — prefer root cfopEntradas (consolidado/competencia atual)
  }
  return {
    cfops: data.cfopEntradas || [],
    competencia: data.competenciaLabel || data.competencia || "—",
    catalog: data.cfopFinalidade || {},
  };
}

function resolveDescFin(cfopItem, catalog, preferGrupo) {
  const cfop = cfopItem.cfop;
  const fromCat = catalog[cfop] || catalog[String(cfop || "").replace(/-/g, "")] || {};
  const desc = cfopItem.descricao || fromCat.descricao || "CFOP " + cfop;
  const fin = preferGrupo
    ? cfopItem.grupo || fromCat.grupo || "—"
    : cfopItem.finalidade || fromCat.finalidade || "—";
  return { desc, fin };
}

function buildSupplierCatalog(cfops, catalog, preferGrupo) {
  const map = new Map();
  cfops.forEach((c) => {
    const { desc, fin } = resolveDescFin(c, catalog, preferGrupo);
    (c.fornecedores || []).forEach((f) => {
      if (!f || !f.nome) return;
      const key = f.cnpj || f.nome;
      if (!map.has(key)) {
        map.set(key, {
          key,
          nome: f.nome,
          cnpj: f.cnpj || "—",
          uf: f.uf || "—",
          total: 0,
          qtd: 0,
          rows: [],
        });
      }
      const entry = map.get(key);
      entry.total += f.total || 0;
      entry.qtd += f.qtd || 0;
      if (f.uf && f.uf !== "—") entry.uf = f.uf;
      if (f.cnpj) entry.cnpj = f.cnpj;
      entry.rows.push({
        cfop: c.cfop,
        desc,
        fin,
        qtd: f.qtd || 0,
        total: f.total || 0,
      });
    });
  });
  return Array.from(map.values())
    .map((e) => {
      e.rows.sort((a, b) => b.total - a.total);
      e.total = Math.round(e.total * 100) / 100;
      return e;
    })
    .sort((a, b) => b.total - a.total);
}

function ensureSpace(doc, need) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + need > bottom) doc.addPage();
}

function drawSupplierSection(doc, supplier, col3Label) {
  ensureSpace(doc, 60);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#111827").text(supplier.nome);
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280")
    .text(`CNPJ: ${supplier.cnpj}  ·  UF: ${supplier.uf}`);
  doc.moveDown(0.3);

  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colW = [
    Math.floor(usable * 0.12),
    Math.floor(usable * 0.34),
    Math.floor(usable * 0.28),
    Math.floor(usable * 0.10),
    0,
  ];
  colW[4] = usable - colW[0] - colW[1] - colW[2] - colW[3];
  const headers = ["CFOP", "Descricao", col3Label, "Qtd NFs", "Valor (R$)"];
  const startX = doc.page.margins.left;
  let y = doc.y;
  const rowH = 16;

  doc.font("Helvetica-Bold").fontSize(8);
  headers.forEach((h, i) => {
    const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
    doc.rect(x, y, colW[i], 18).fillAndStroke("#22a329", "#1b8a20");
    doc.fillColor("#ffffff").text(h, x + 3, y + 5, { width: colW[i] - 6 });
  });
  y += 18;

  doc.font("Helvetica").fontSize(7);
  supplier.rows.forEach((r, idx) => {
    if (y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    const fill = idx % 2 === 0 ? "#ffffff" : "#f3f4f6";
    const cells = [r.cfop, r.desc, r.fin, String(r.qtd), fmtBRL(r.total)];
    cells.forEach((cell, i) => {
      const x = startX + colW.slice(0, i).reduce((a, b) => a + b, 0);
      doc.rect(x, y, colW[i], rowH).fillAndStroke(fill, "#e5e7eb");
      doc.fillColor("#111827").text(String(cell), x + 3, y + 4, {
        width: colW[i] - 6,
        align: i >= 3 ? "right" : "left",
        ellipsis: true,
        lineBreak: false,
        height: rowH - 2,
      });
    });
    y += rowH;
  });

  if (y > doc.page.height - doc.page.margins.bottom - 24) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  const subX = startX + colW.slice(0, 3).reduce((a, b) => a + b, 0);
  doc.rect(startX, y, colW[0] + colW[1] + colW[2], 18).fillAndStroke("#f1f5f9", "#e5e7eb");
  doc.rect(subX, y, colW[3], 18).fillAndStroke("#f1f5f9", "#e5e7eb");
  doc.rect(subX + colW[3], y, colW[4], 18).fillAndStroke("#f1f5f9", "#e5e7eb");
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#111827")
    .text("Subtotal:", startX + 3, y + 5, { width: colW[0] + colW[1] + colW[2] - 6, align: "right" });
  doc.text(fmtBRL(supplier.total), subX + colW[3] + 3, y + 5, { width: colW[4] - 6, align: "right" });
  doc.y = y + 26;
}

async function writePdf(outFile, { companyName, competencia, suppliers, note, col3Label }) {
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 36, size: "A4" });
    const stream = fs.createWriteStream(outFile);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#1a8a20")
      .text("Relatorio por Fornecedor", { align: "center" });
    doc.moveDown(0.3);
    doc.font("Helvetica").fontSize(10).fillColor("#4b5563")
      .text(`${companyName} — ${competencia} — ${new Date().toLocaleDateString("pt-BR")}`, {
        align: "center",
      });
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor("#9ca3af")
      .text(`Top ${Math.min(TOP_N, suppliers.length)} fornecedores por valor (dados locais da empresa)`, {
        align: "center",
      });
    doc.moveDown(1);

    if (note) {
      doc.font("Helvetica").fontSize(10).fillColor("#b45309").text(note, { align: "left" });
      doc.moveDown(1);
    }

    if (!suppliers.length) {
      doc.font("Helvetica").fontSize(11).fillColor("#6b7280")
        .text("Nenhum fornecedor detalhado disponivel neste pacote de dados.");
      doc.end();
      return;
    }

    suppliers.forEach((s) => drawSupplierSection(doc, s, col3Label));

    const totalGeral = suppliers.reduce((a, s) => a + (s.total || 0), 0);
    ensureSpace(doc, 30);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827")
      .text(`Total Geral (selecionados): ${fmtBRL(totalGeral)}`, { align: "right" });

    doc.end();
  });
}

async function processCompany(cfg) {
  let companyName = cfg.label;
  let cfops = [];
  let competencia = "—";
  let catalog = {};
  let preferGrupo = cfg.id === "egaplast";
  let note = "";

  if (cfg.kind === "loja") {
    const { EMPRESA, FISCAL_POR_MES } = loadLojaFromEjs(cfg.file);
    companyName = EMPRESA.nome || cfg.label;
    const keys = Object.keys(FISCAL_POR_MES).sort();
    const last = keys[keys.length - 1];
    const pack = FISCAL_POR_MES[last];
    cfops = pack.cfopEntradas || [];
    competencia = pack.competenciaLabel || last;
  } else if (cfg.kind === "jpg") {
    const J = loadJpgFromEjs(cfg.file);
    companyName = (J.meta && J.meta.empresa) || cfg.label;
    competencia = (J.meta && (J.meta.periodoRange || J.meta.periodo)) || "—";
    const porMes = (J.fiscalPorMes && J.fiscalPorMes.porMes) || {};
    const keys = Object.keys(porMes).sort();
    const last = keys[keys.length - 1];
    const pack = porMes[last] || {};
    cfops = jpgCfopsToStandard((pack.empresa && pack.empresa.cfop_entradas) || []);
    if (!cfops.length && pack.filiais) {
      const first = Object.values(pack.filiais)[0];
      if (first) cfops = jpgCfopsToStandard(first.cfop_entradas || []);
    }
  } else {
    const data = loadJsData(cfg.file);
    companyName = (data.empresa && data.empresa.nome) || cfg.label;
    const pack = getCfopList(data, cfg.kind);
    cfops = pack.cfops;
    competencia = pack.competencia;
    catalog = pack.catalog;
  }

  const all = buildSupplierCatalog(cfops, catalog, preferGrupo);
  const selected = all.slice(0, TOP_N);
  // Inclui "Demais fornecedores" (mesmo comportamento do modal UNICA)
  const selectedKeys = new Set(selected.map((s) => s.key || s.cnpj || s.nome));
  const demaisMap = {};
  cfops.forEach((c) => {
    const { desc, fin } = resolveDescFin(c, catalog, preferGrupo);
    (c.fornecedores || []).forEach((f) => {
      if (!f || !f.nome) return;
      const key = (f.cnpj && String(f.cnpj).trim()) || f.nome;
      if (selectedKeys.has(key)) return;
      if (!demaisMap[c.cfop]) {
        demaisMap[c.cfop] = { cfop: c.cfop, desc, fin, qtd: 0, total: 0 };
      }
      demaisMap[c.cfop].qtd += f.qtd || 0;
      demaisMap[c.cfop].total += f.total || 0;
    });
  });
  const demaisRows = Object.values(demaisMap)
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
  if (demaisRows.length) {
    selected.push({
      nome: "Demais fornecedores",
      cnpj: "—",
      uf: "—",
      total: demaisRows.reduce((s, r) => s + r.total, 0),
      rows: demaisRows,
    });
  }

  if (cfg.id === "schumacher" && !selected.length) {
    note =
      "Detalhe por fornecedor indisponivel no pacote atual da Schumacher " +
      "(cfopEntradas sem lista de fornecedores). Funcao de impressao validada; " +
      "aguarde SPED/entradas com C100 para popular o relatorio.";
  }

  const slug = cfg.id;
  const outFile = path.join(outDir, `relatorio-fornecedor-${slug}.pdf`);
  await writePdf(outFile, {
    companyName,
    competencia,
    suppliers: selected,
    note,
    col3Label: preferGrupo ? "Grupo" : "Finalidade",
  });

  return {
    id: cfg.id,
    companyName,
    competencia,
    suppliers: selected.length,
    total: selected.reduce((a, s) => a + s.total, 0),
    file: outFile,
    note: note || null,
    ok: true,
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  // Validacao rapida: printBySupplier nas views corrigidas
  const views = [
    "baifer1trm.ejs",
    "baifer2trm.ejs",
    "du-lanche.ejs",
    "egaplast.ejs",
    "UNICATINTAS.ejs",
    "schumacher.ejs",
    "loja-maquinas.ejs",
    "lojamaquinas1trm.ejs",
    "jpg.ejs",
  ];
  const viewsDir = path.join(__dirname, "..", "src", "views");
  console.log("=== Validacao printBySupplier + exportSupplierPdf ===");
  for (const v of views) {
    const html = fs.readFileSync(path.join(viewsDir, v), "utf8");
    const hasPrint = html.includes("function printBySupplier") || html.includes("window.printBySupplier");
    const hasPdf = html.includes("function exportSupplierPdf") || html.includes("window.exportSupplierPdf");
    console.log(`  ${v}: print=${hasPrint ? "OK" : "NO"} pdf=${hasPdf ? "OK" : "NO"}`);
    if (!hasPrint || !hasPdf) throw new Error("Relatorio incompleto em " + v);
  }

  console.log("\n=== Gerando PDFs (dados locais por empresa) ===");
  const results = [];
  for (const cfg of COMPANIES) {
    const r = await processCompany(cfg);
    results.push(r);
    console.log(
      `  [${r.id}] ${r.companyName} | ${r.competencia} | ${r.suppliers} forn. | ${fmtBRL(r.total)}`
    );
    console.log(`       -> ${r.file}`);
    if (r.note) console.log(`       !! ${r.note}`);
  }

  const summaryPath = path.join(outDir, "resumo-validacao.json");
  fs.writeFileSync(summaryPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  console.log("\nResumo:", summaryPath);
  console.log("Concluido.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
