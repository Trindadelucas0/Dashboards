/**
 * Corrige Relatorio por Fornecedor da JPG.
 * Causas:
 * 1) print sem body.supplier-printing -> #print-supplier-report fica display:none
 * 2) botao filial usa JPG_DATA.filiais (inexistente) + registerJpgCtx retorna key
 * 3) Demais fornecedores no HTML (ejs) sem logica no print/PDF
 */
const fs = require("fs");
const path = require("path");

const files = [
  path.join("c:/Users/trind/Desktop/dashboards/jpg/JPG.html"),
  path.join("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/jpg.ejs"),
];

const DEMAIS_HTML = `      <label class="supplier-item supplier-item-demais" id="demaisFornecedoresOption">
        <input type="checkbox" id="includeDemaisFornecedores" checked>
        <span class="supplier-info">
          <strong>Demais fornecedores</strong>
          <small>Agrupa fornecedores nao selecionados por CFOP</small>
        </span>
      </label>
`;

function patch(content) {
  let c = content;

  // 1) Modal: garantir Demais antes de #supplierList
  if (!c.includes('id="includeDemaisFornecedores"')) {
    c = c.replace(
      /(<div class="supplier-actions">[\s\S]*?<\/div>)\s*(<div class="supplier-list" id="supplierList"><\/div>)/,
      `$1\n${DEMAIS_HTML}      $2`
    );
  }

  // 2) Botao filial: usar pack ativo
  c = c.replace(
    /onclick="openSupplierModal\(jpgCtxRegistry\['\$\{key\}_'\]\|\|registerJpgCtx\('\$\{key\}_', JPG_DATA\.filiais\['\$\{key\}'\]\)\)"/g,
    `onclick="openFilialSupplierModal('\${key}')"`
  );

  // 3) openFilialSupplierModal + openSupplierModalActive robustos
  if (!c.includes("function openFilialSupplierModal(")) {
    c = c.replace(
      /function openSupplierModalActive\(\) \{\s*const D = getScopeData\(\);\s*if \(!D\) return;\s*openSupplierModal\(jpgCtxRegistry\.ACTIVE \|\| makeJpgContext\(D, D\.meta\?\.filial_label\)\);\s*\}/,
      `function openFilialSupplierModal(filialKey) {
  const pack = typeof getActivePack === 'function' ? getActivePack() : null;
  const data = pack && pack.filiais ? pack.filiais[filialKey] : null;
  if (!data) {
    alert('Dados da filial ' + filialKey + ' nao encontrados no periodo ativo.');
    return;
  }
  const key = filialKey + '_';
  registerJpgCtx(key, data, (data.meta && data.meta.filial_label) || filialKey);
  openSupplierModal(jpgCtxRegistry[key]);
}

function openSupplierModalActive() {
  const D = getScopeData();
  if (!D) {
    alert('Sem dados da unidade ativa para o relatorio por fornecedor.');
    return;
  }
  const label = (D.meta && D.meta.filial_label) || (typeof unidadeAtiva !== 'undefined' && unidadeAtiva === 'TODAS' ? 'Empresa (consolidado)' : (unidadeAtiva || 'JPG'));
  registerJpgCtx('ACTIVE', D, label);
  openSupplierModal(jpgCtxRegistry.ACTIVE);
}`
    );
  }

  // 4) filterSuppliers seguro (Demais fora da lista / data-search)
  c = c.replace(
    /function filterSuppliers\(query\) \{\s*const q = \(query \|\| ''\)\.toLowerCase\(\);\s*document\.querySelectorAll\('#supplierList \.supplier-item'\)\.forEach\(\(el\) => \{\s*el\.style\.display = el\.dataset\.search\.includes\(q\) \? '' : 'none';\s*\}\);\s*\}/,
    `function filterSuppliers(query) {
  const q = (query || '').toLowerCase();
  document.querySelectorAll('#supplierList .supplier-item').forEach((el) => {
    if (el.id === 'demaisFornecedoresOption' || el.classList.contains('supplier-item-demais')) return;
    const search = el.dataset.search || '';
    el.style.display = search.includes(q) ? '' : 'none';
  });
}`
  );

  // 5) buildSupplierReportData com Demais
  const oldBuild = /function buildSupplierReportData\(selected\) \{[\s\S]*?return \{ suppliers, totalGeral, periodo, empresa, label: ctx \? ctx\.label : '' \};\s*\}/;
  if (!oldBuild.test(c)) throw new Error("buildSupplierReportData block not found");
  c = c.replace(
    oldBuild,
    `function buildSupplierReportData(selected, includeDemais) {
  const ctx = jpgSupplierCtx;
  const cfops = ctx && ctx.data ? ctx.data.cfop_entradas || [] : [];
  const periodo = (typeof window.getJpgCompetenciaLabel === 'function')
    ? window.getJpgCompetenciaLabel()
    : ((typeof JPG_DATA !== 'undefined' && JPG_DATA.meta) ? (JPG_DATA.meta.periodoRange || JPG_DATA.meta.periodo) : '—');
  const empresa = (typeof JPG_DATA !== 'undefined' && JPG_DATA.meta) ? JPG_DATA.meta.empresa : 'JPG';
  let totalGeral = 0;
  const suppliers = [];
  const selectedKeys = new Set();
  selected.forEach((cb) => {
    const cnpj = cb.value;
    const nome = cb.dataset.nome;
    selectedKeys.add((cnpj || '').trim() || nome);
    const rows = [];
    let subtotal = 0;
    let uf = '—';
    cfops.forEach((cfop) => {
      const f = (cfop.parties || []).find((x) => (x.cnpj || '').trim() === cnpj || x.nome === nome);
      if (f) {
        rows.push({ cfop: cfop.cfop, desc: cfop.descricao, fin: cfop.finalidade, qtd: f.qtd, total: f.total });
        subtotal += f.total;
        uf = f.uf || uf;
      }
    });
    if (!rows.length) return;
    totalGeral += subtotal;
    suppliers.push({ nome, cnpj, uf, rows, subtotal });
  });
  if (includeDemais) {
    const demaisMap = {};
    cfops.forEach((cfop) => {
      (cfop.parties || []).forEach((f) => {
        const key = (f.cnpj || '').trim() || f.nome;
        if (!key || selectedKeys.has(key)) return;
        if (!demaisMap[cfop.cfop]) {
          demaisMap[cfop.cfop] = { cfop: cfop.cfop, desc: cfop.descricao, fin: cfop.finalidade, qtd: 0, total: 0 };
        }
        demaisMap[cfop.cfop].qtd += f.qtd || 0;
        demaisMap[cfop.cfop].total += f.total || 0;
      });
    });
    const demaisRows = Object.values(demaisMap).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
    const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
    if (demaisRows.length) {
      totalGeral += subtotal;
      suppliers.push({ nome: 'Demais fornecedores', cnpj: '—', uf: '—', rows: demaisRows, subtotal });
    }
  }
  return { suppliers, totalGeral, periodo, empresa, label: ctx ? ctx.label : '' };
}`
  );

  // 6) printBySupplier: Demais + supplier-printing
  const oldPrint = /function printBySupplier\(\) \{[\s\S]*?window\.print\(\);\s*\}/;
  if (!oldPrint.test(c)) throw new Error("printBySupplier block not found");
  c = c.replace(
    oldPrint,
    `function printBySupplier() {
  const selected = Array.from(document.querySelectorAll('#supplierList .supplier-item input:checked'));
  const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
  if (!selected.length && !includeDemais) {
    alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
    return;
  }
  const { suppliers, totalGeral, periodo, empresa, label } = buildSupplierReportData(selected, includeDemais);
  if (!suppliers.length || totalGeral <= 0) {
    alert('Nenhum dado encontrado para os fornecedores selecionados neste periodo.');
    return;
  }
  closeSupplierModal();
  let html = '<div class="supplier-print-root" style="font-family:Inter,sans-serif;padding:0;margin:0;color:#1a1a2e;background:#fff;width:100%;max-width:100%;box-sizing:border-box;">';
  html += '<h1 style="font-size:18px;margin-bottom:4px;">Relatório por Fornecedor</h1>';
  html += '<p style="font-size:12px;color:#555;margin-bottom:24px;">' + empresa + (label ? ' — ' + label : '') + ' — ' + periodo + ' — ' + new Date().toLocaleDateString('pt-BR') + '</p>';
  suppliers.forEach((s) => {
    html += '<div class="supplier-print-block" style="margin-bottom:12px;page-break-inside:auto;width:100%;max-width:100%;box-sizing:border-box;">';
    html += '<h2 style="font-size:14px;border-bottom:2px solid #3b82f6;padding-bottom:6px;">' + s.nome + '</h2>';
    html += '<p style="font-size:11px;color:#555;">CNPJ: ' + s.cnpj + ' · UF: ' + s.uf + '</p>';
    html += '<table style="width:100%;max-width:100%;border-collapse:collapse;margin-top:8px;font-size:10px;table-layout:fixed;"><colgroup><col class="cfop"><col class="desc"><col class="fin"><col class="qtd"><col class="val"></colgroup>';
    html += '<thead><tr style="background:#f0f0f0;"><th style="padding:4px 5px;text-align:left;">CFOP</th>';
    html += '<th style="padding:4px 5px;text-align:left;">Descrição</th><th style="padding:4px 5px;text-align:left;">Finalidade</th>';
    html += '<th style="padding:4px 5px;text-align:right;">Qtd NFs</th><th style="padding:4px 5px;text-align:right;">Valor (R$)</th></tr></thead><tbody>';
    s.rows.forEach((r) => {
      html += '<tr><td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;">' + r.cfop + '</td>';
      html += '<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;">' + r.desc + '</td>';
      html += '<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;">' + r.fin + '</td>';
      html += '<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;text-align:right;">' + r.qtd + '</td>';
      html += '<td style="padding:4px 5px;border-bottom:1px solid #ddd;word-wrap:break-word;text-align:right;font-weight:600;">' +
        r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr>';
    });
    html += '</tbody><tfoot><tr><td colspan="4" style="padding:6px 5px;text-align:right;font-weight:700;">Subtotal:</td>';
    html += '<td style="padding:6px 5px;text-align:right;font-weight:700;">R$ ' +
      s.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr></tfoot></table></div>';
  });
  html += '<div style="border-top:2px solid #1a1a2e;padding-top:12px;margin-top:16px;text-align:right;font-size:14px;font-weight:700;">';
  html += 'Total Geral: R$ ' + totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>';
  const old = document.getElementById('print-supplier-report');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'print-supplier-report';
  div.innerHTML = html;
  document.body.appendChild(div);
  document.body.classList.add('supplier-printing');
  const cleanup = () => {
    document.body.classList.remove('supplier-printing');
    div.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}`
  );

  // 7) exportSupplierPdf: Demais
  const oldPdf = /function exportSupplierPdf\(\) \{\s*const selected = Array\.from\(document\.querySelectorAll\('#supplierList input:checked'\)\);\s*if \(!selected\.length\) \{ alert\('Selecione ao menos um fornecedor\.'\); return; \}/;
  if (!oldPdf.test(c)) throw new Error("exportSupplierPdf start not found");
  c = c.replace(
    oldPdf,
    `function exportSupplierPdf() {
  const selected = Array.from(document.querySelectorAll('#supplierList .supplier-item input:checked'));
  const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
  if (!selected.length && !includeDemais) {
    alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
    return;
  }`
  );
  c = c.replace(
    /const \{ suppliers, totalGeral, periodo, empresa, label \} = buildSupplierReportData\(selected\);\s*closeSupplierModal\(\);/,
    `const { suppliers, totalGeral, periodo, empresa, label } = buildSupplierReportData(selected, includeDemais);
  if (!suppliers.length || totalGeral <= 0) {
    alert('Nenhum dado encontrado para os fornecedores selecionados neste periodo.');
    return;
  }
  closeSupplierModal();`
  );

  // 8) CSS: modal fechado por padrao mesmo com regra display:flex
  if (!c.includes("#supplierModal[style*='display: none']") && !c.includes("#supplierModal { display: none")) {
    c = c.replace(
      ".modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; }",
      `.modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:200; display:none; align-items:center; justify-content:center; padding:20px; }
    .modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"] { display:flex !important; }`
    );
  }

  return c;
}

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = patch(before);
  if (after === before) {
    console.log("NO CHANGE?", path.basename(file));
  } else {
    fs.writeFileSync(file, after);
    console.log("patched", path.basename(file), "delta", after.length - before.length);
  }
}

// sanity
for (const file of files) {
  const s = fs.readFileSync(file, "utf8");
  const checks = [
    ["openFilialSupplierModal", s.includes("function openFilialSupplierModal(")],
    ["supplier-printing", s.includes("classList.add('supplier-printing')")],
    ["Demais HTML", s.includes('id="includeDemaisFornecedores"')],
    ["buildDemais", s.includes("includeDemais")],
    ["no JPG_DATA.filiais in button", !s.includes("JPG_DATA.filiais['${key}']")],
  ];
  console.log("\n" + path.basename(file));
  checks.forEach(([n, ok]) => console.log(ok ? "OK" : "FAIL", n));
}
