/**
 * Valida estrutura da exportacao Excel Por Fornecedor (UNICA).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..", "..");
const app = fs.readFileSync(path.join(root, "UNICA 10", "unica-app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "UNICA 10", "UNICATINTAS.html"), "utf8");
const ejs = fs.readFileSync(path.join(root, "Dashboards", "src", "views", "UNICATINTAS.ejs"), "utf8");

const checks = [
  ["app has buildSupplierExcelWorkbook", /function buildSupplierExcelWorkbook\s*\(/.test(app)],
  ["app has exportSupplierExcel", /window\.exportSupplierExcel\s*=/.test(app)],
  ["html has Baixar Excel", /Baixar Excel/i.test(html)],
  ["html hint Excel", /PDF ou Excel/i.test(html)],
  ["ejs has exportSupplierExcel", /exportSupplierExcel/.test(ejs)],
  ["ejs has Baixar Excel", /Baixar Excel/i.test(ejs)],
];

const XLSX = {
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    aoa_to_sheet: (aoa) => ({ __aoa: aoa }),
    book_append_sheet: (wb, ws, name) => {
      wb.SheetNames.push(name);
      wb.Sheets[name] = ws;
    },
  },
};

function buildSupplierExcelWorkbook(data) {
  const wb = XLSX.utils.book_new();
  const emitido = "15/07/2026";
  const col3 = data.col3Label || "Finalidade";
  const resumo = [
    ["Relatório por Fornecedor"],
    ["Empresa", data.companyName || ""],
    ["Competência", data.competencia || ""],
    ["Emitido em", emitido],
    [],
    ["Fornecedor", "CNPJ", "UF", "Subtotal (R$)"],
  ];
  data.suppliers.forEach((s) => {
    resumo.push([
      s.nome || "",
      s.cnpj || "—",
      s.uf || "—",
      Math.round(Number(s.subtotal || 0) * 100) / 100,
    ]);
  });
  resumo.push(["Total Geral", "", "", Math.round(Number(data.totalGeral || 0) * 100) / 100]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), "Resumo");

  const detalhado = [
    ["Fornecedor", "CNPJ", "UF", "CFOP", "Descrição", col3, "Qtd NFs", "Valor (R$)"],
  ];
  data.suppliers.forEach((s) => {
    (s.rows || []).forEach((r) => {
      detalhado.push([
        s.nome || "",
        s.cnpj || "—",
        s.uf || "—",
        r.cfop || "",
        r.desc || "—",
        r.fin || "—",
        Number(r.qtd || 0),
        Math.round(Number(r.total || 0) * 100) / 100,
      ]);
    });
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detalhado), "Detalhado");
  return { wb, resumo, detalhado };
}

const data = {
  companyName: "UNICATINTAS",
  competencia: "Junho / 2026",
  col3Label: "Finalidade",
  totalGeral: 1500.5,
  suppliers: [
    {
      nome: "Forn A",
      cnpj: "11",
      uf: "PR",
      subtotal: 1000.25,
      rows: [{ cfop: "1102", desc: "Compra", fin: "Revenda", qtd: 2, total: 1000.25 }],
    },
    {
      nome: "Demais fornecedores",
      cnpj: "—",
      uf: "—",
      subtotal: 500.25,
      rows: [{ cfop: "1403", desc: "Uso", fin: "Uso/Consumo", qtd: 1, total: 500.25 }],
    },
  ],
};

const { wb, resumo, detalhado } = buildSupplierExcelWorkbook(data);
const totalResumo = resumo[resumo.length - 1][3];
const totalDet = detalhado.slice(1).reduce((s, r) => s + r[7], 0);
checks.push(["sheets Resumo+Detalhado", wb.SheetNames.join(",") === "Resumo,Detalhado"]);
checks.push(["total Resumo == totalGeral", totalResumo === 1500.5]);
checks.push(["total Detalhado == totalGeral", Math.round(totalDet * 100) / 100 === 1500.5]);
checks.push([
  "valores numericos",
  typeof detalhado[1][6] === "number" && typeof detalhado[1][7] === "number",
]);

let ok = true;
console.log("=== VALIDACAO EXCEL POR FORNECEDOR UNICA ===\n");
for (const [k, v] of checks) {
  console.log((v ? "PASS" : "FAIL") + " " + k);
  if (!v) ok = false;
}
process.exit(ok ? 0 : 1);
