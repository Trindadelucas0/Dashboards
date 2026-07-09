const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const admins = require("../src/config/admins");
const users = require("../src/data/users.json");
const dashboards = require("../src/config/dashboards");

const outDir = path.join(__dirname, "..", "relatorios");
const outFile = path.join(outDir, "acessos-dashboards.pdf");

const dashboardLabelById = Object.fromEntries(dashboards.map((d) => [d.id, d.label]));

function drawTable(doc, headers, rows, colWidths) {
  const startX = doc.page.margins.left;
  let y = doc.y;
  const rowHeight = 22;
  const headerHeight = 26;

  doc.font("Helvetica-Bold").fontSize(9);
  headers.forEach((header, i) => {
    const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.rect(x, y, colWidths[i], headerHeight).fillAndStroke("#e8f5e9", "#c8e6c9");
    doc.fillColor("#1b5e20").text(header, x + 6, y + 8, { width: colWidths[i] - 12 });
  });

  y += headerHeight;
  doc.font("Helvetica").fontSize(9);

  rows.forEach((row, rowIndex) => {
    if (y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      y = doc.page.margins.top;
    }

    const fill = rowIndex % 2 === 0 ? "#ffffff" : "#f9fafb";
    row.forEach((cell, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.rect(x, y, colWidths[i], rowHeight).fillAndStroke(fill, "#e5e7eb");
      doc.fillColor("#111827").text(String(cell), x + 6, y + 7, { width: colWidths[i] - 12 });
    });
    y += rowHeight;
  });

  doc.y = y + 10;
}

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const doc = new PDFDocument({ margin: 48, size: "A4" });
  const stream = fs.createWriteStream(outFile);
  doc.pipe(stream);

  doc.font("Helvetica-Bold").fontSize(18).fillColor("#1a8a20").text("Relatorio de Acessos — Dashboards Exito", {
    align: "center",
  });
  doc.moveDown(0.4);
  doc.font("Helvetica").fontSize(10).fillColor("#4b5563").text(
    `Gerado em ${new Date().toLocaleString("pt-BR")} · Login em http://localhost:4243/`,
    { align: "center" }
  );
  doc.moveDown(1.2);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Administradores (acesso total)");
  doc.moveDown(0.4);
  drawTable(
    doc,
    ["Perfil", "Usuario", "Senha", "Acesso"],
    admins.map((a) => ["Admin", a.username, a.password, "Todas as empresas + gerenciar usuarios"]),
    [70, 90, 90, 265]
  );

  doc.moveDown(0.8);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Usuarios por empresa (acesso restrito)");
  doc.moveDown(0.4);
  drawTable(
    doc,
    ["Empresa", "Usuario", "Senha", "Dashboard liberado"],
    users.map((u) => {
      const labels = (u.dashboards || []).map((id) => dashboardLabelById[id] || id).join(", ");
      return [labels, u.username, u.password, labels];
    }),
    [120, 90, 90, 215]
  );

  doc.moveDown(1);
  doc.font("Helvetica").fontSize(9).fillColor("#6b7280").text(
    "Cada usuario comum ve apenas o card da empresa liberada. Tentativa de abrir outra rota retorna acesso negado.",
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right }
  );

  doc.end();

  stream.on("finish", () => {
    console.log(`PDF gerado: ${outFile}`);
  });
}

main();
