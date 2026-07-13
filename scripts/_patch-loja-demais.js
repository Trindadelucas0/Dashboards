const fs = require("fs");
const path = require("path");

const root = "c:/Users/trind/Desktop/dashboards";

const DEMAIS_HELPER = `
  function aggregateDemaisLoja(selectedKeys) {
    const map = {};
    (CFOP_DADOS || []).forEach((cfop) => {
      (cfop.fornecedores || []).forEach((f) => {
        const key = (f.cnpj && String(f.cnpj).trim()) || f.nome;
        if (!key || selectedKeys.has(key)) return;
        if (!map[cfop.cfop]) {
          const info = (CFOP_FINALIDADE[cfop.cfop] || {});
          map[cfop.cfop] = {
            cfop: cfop.cfop,
            desc: info.descricao || '—',
            fin: info.finalidade || '—',
            qtd: 0,
            total: 0,
          };
        }
        map[cfop.cfop].qtd += f.qtd || 0;
        map[cfop.cfop].total += f.total || 0;
      });
    });
    return Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  }
`;

function patchLojaPrint() {
  const file = path.join(root, "lojja/LOJA-MAQUINAS.html");
  let html = fs.readFileSync(file, "utf8");
  if (html.includes("aggregateDemaisLoja")) {
    console.log("LOJA print Demais already patched");
    return;
  }

  // Patch printBySupplier start validation
  html = html.replace(
    `function printBySupplier() {
    const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
    if (!selected.length) { alert('Selecione ao menos um fornecedor.'); return; }

    closeSupplierModal();`,
    DEMAIS_HELPER + `
  function printBySupplier() {
    const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
    if (!selected.length && !includeDemais) {
      alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
      return;
    }

    closeSupplierModal();`
  );

  // After selected.forEach block closing, before html total - inject demais
  // Find the pattern after the forEach of selected in printBySupplier
  const marker = `    html += '<div style="border-top:2px solid #1a1a2e;padding-top:12px;margin-top:16px;text-align:right;font-size:14px;font-weight:700;">';
    html += 'Total Geral: R$ ' + totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>';

    const old = document.getElementById('print-supplier-report');`;

  const insertDemais = `    const selectedKeys = new Set(selected.map((cb) => cb.value || cb.dataset.nome));
    if (includeDemais) {
      const demaisRows = aggregateDemaisLoja(selectedKeys);
      if (demaisRows.length) {
        const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
        totalGeral += subtotal;
        const nome = 'Demais fornecedores';
        html += '<div style="margin-bottom:28px;page-break-inside:avoid;">';
        html += '<h2 style="font-size:14px;border-bottom:2px solid #22a329;padding-bottom:6px;">' + nome + '</h2>';
        html += '<p style="font-size:11px;color:#555;">CNPJ: — · UF: —</p>';
        html += '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">';
        html += '<thead><tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">CFOP</th>';
        html += '<th style="padding:8px;text-align:left;">Descrição</th><th style="padding:8px;text-align:left;">Finalidade</th>';
        html += '<th style="padding:8px;text-align:right;">Qtd NFs</th><th style="padding:8px;text-align:right;">Valor (R$)</th></tr></thead><tbody>';
        demaisRows.forEach((r) => {
          html += '<tr><td style="padding:8px;border-bottom:1px solid #ddd;">' + r.cfop + '</td>';
          html += '<td style="padding:8px;border-bottom:1px solid #ddd;">' + r.desc + '</td>';
          html += '<td style="padding:8px;border-bottom:1px solid #ddd;">' + r.fin + '</td>';
          html += '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">' + r.qtd + '</td>';
          html += '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">' +
            r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr>';
        });
        html += '</tbody><tfoot><tr><td colspan="4" style="padding:10px;text-align:right;font-weight:700;">Subtotal:</td>';
        html += '<td style="padding:10px;text-align:right;font-weight:700;">R$ ' +
          subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr></tfoot></table></div>';
      }
    }

    ` + marker;

  if (!html.includes(marker)) throw new Error("print marker not found in loja");
  html = html.replace(marker, insertDemais);

  // Patch exportSupplierPdf validation similarly
  html = html.replace(
    `function exportSupplierPdf() {
    const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
    if (!selected.length) { alert('Selecione ao menos um fornecedor.'); return; }`,
    `function exportSupplierPdf() {
    const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
    if (!selected.length && !includeDemais) {
      alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
      return;
    }`
  );

  html = html.replace(
    `const data = buildLojaSupplierReportData(selected);
    if (data.totalGeral <= 0) {
      alert('Nenhum dado encontrado para os fornecedores selecionados neste período.');
      return;
    }
    closeSupplierModal();`,
    `const data = buildLojaSupplierReportData(selected);
    if (includeDemais) {
      const selectedKeys = new Set(selected.map((cb) => cb.value || cb.dataset.nome));
      const demaisRows = aggregateDemaisLoja(selectedKeys);
      if (demaisRows.length) {
        const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
        data.suppliers.push({ nome: 'Demais fornecedores', cnpj: '—', uf: '—', rows: demaisRows, subtotal: subtotal });
        data.totalGeral += subtotal;
      }
    }
    if (data.totalGeral <= 0) {
      alert('Nenhum dado encontrado para os fornecedores selecionados neste período.');
      return;
    }
    closeSupplierModal();`
  );

  fs.writeFileSync(file, html);
  console.log("LOJA Demais print/pdf patched");
}

patchLojaPrint();
console.log("OK");
