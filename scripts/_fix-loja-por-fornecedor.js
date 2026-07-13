/**
 * Loja Maquinas: garantir Por Fornecedor visivel e funcional na Finalidade.
 */
const fs = require("fs");
const path = require("path");

const files = [
  path.join("c:/Users/trind/Desktop/dashboards/lojja/LOJA-MAQUINAS.html"),
  path.join("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/loja-maquinas.ejs"),
  path.join("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/lojamaquinas1trm.ejs"),
];

const FIN_BAR = `
        <div class="fin-supplier-bar" id="fin-supplier-bar">
          <button type="button" class="btn-export print" id="btn-por-fornecedor" onclick="openSupplierModal()" title="Imprimir por Fornecedor">
            <i class="fas fa-truck"></i> Por Fornecedor
          </button>
          <span class="fin-supplier-hint">Selecione fornecedores e emita o relatório (Imprimir ou PDF) da competência ativa.</span>
        </div>
`;

const FIN_BAR_CSS = `
    .fin-supplier-bar {
      display:flex; align-items:center; gap:12px; flex-wrap:wrap;
      margin:0 0 16px; padding:12px 14px;
      background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.4);
      border-radius:10px;
    }
    .fin-supplier-bar .btn-export.print {
      font-weight:700; font-size:13px; padding:10px 16px;
    }
    .fin-supplier-hint { font-size:12px; color:var(--text-sec); line-height:1.4; }
`;

const OPEN_MODAL_FIXED = `  function openSupplierModal() {
    const modal = document.getElementById('supplierModal');
    const list = document.getElementById('supplierList');
    if (!modal || !list) {
      alert('Modal de fornecedores nao encontrado nesta pagina.');
      return;
    }
    try {
      const suppliers = collectUniqueSuppliers();
      const esc = (v) => String(v == null ? '' : v).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
      if (!suppliers.length) {
        list.innerHTML = '<p class="td-mute" style="padding:16px;">Nenhum fornecedor nesta competencia. Troque o periodo no seletor do topo.</p>';
      } else {
        list.innerHTML = suppliers.map(s => {
          const search = ((s.nome || '') + ' ' + (s.cnpj || '') + ' ' + (s.uf || '')).toLowerCase();
          return '<label class="supplier-item" data-search="' + esc(search) + '">' +
            '<input type="checkbox" value="' + esc(s.cnpj || s.nome || '') + '" data-nome="' + esc(s.nome) + '" data-key="' + esc((s.cnpj && String(s.cnpj).trim()) || s.nome || '') + '" data-uf="' + esc(s.uf || '—') + '">' +
            '<span class="supplier-info"><strong>' + esc(s.nome) + '</strong>' +
            '<small>' + esc(s.cnpj || '—') + ' · ' + esc(s.uf || '—') + '</small></span></label>';
        }).join('');
      }
    } catch (err) {
      console.error('openSupplierModal', err);
      list.innerHTML = '<p class="td-mute" style="padding:16px;">Erro ao carregar fornecedores.</p>';
    }
    const search = document.getElementById('supplierSearch');
    if (search) search.value = '';
    const demais = document.getElementById('includeDemaisFornecedores');
    if (demais) demais.checked = true;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }`;

function patch(content) {
  let c = content;

  // CSS: modal default hidden + fin bar
  if (!c.includes(".fin-supplier-bar")) {
    c = c.replace(
      "    /* === SUPPLIER MODAL === */\n    .modal-overlay {\n      position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(4px);\n      z-index:1000; display:flex; align-items:center; justify-content:center; padding:20px;\n    }",
      FIN_BAR_CSS +
        "\n    /* === SUPPLIER MODAL === */\n    .modal-overlay {\n      position:fixed; inset:0; background:rgba(0,0,0,.65); backdrop-filter:blur(4px);\n      z-index:1000; display:none; align-items:center; justify-content:center; padding:20px;\n    }\n    .modal-overlay[style*=\"display: flex\"], .modal-overlay[style*=\"display:flex\"] {\n      display:flex !important;\n    }"
    );
  }

  // HTML bar under Finalidade header
  if (!c.includes('id="fin-supplier-bar"')) {
    c = c.replace(
      /(<section id="tab-finalidade" class="tab-section">\s*<div class="sec-header">[\s\S]*?<\/div>\s*<\/div>\s*)(\s*<div class="alert-box")/,
      `$1${FIN_BAR}$2`
    );
  }

  // Ensure header button still present
  if (!c.includes('onclick="openSupplierModal()"')) {
    throw new Error("header Por Fornecedor button missing");
  }

  // Replace openSupplierModal
  const openRe = /  function openSupplierModal\(\) \{[\s\S]*?\n  \}\r?\n\r?\n  function closeSupplierModal/;
  if (!openRe.test(c)) throw new Error("openSupplierModal block not found");
  c = c.replace(openRe, OPEN_MODAL_FIXED + "\n\n  function closeSupplierModal");

  // filterSuppliers safe
  c = c.replace(
    /function filterSuppliers\(query\) \{\s*const q = query\.toLowerCase\(\);\s*document\.querySelectorAll\('#supplierList \.supplier-item'\)\.forEach\(el => \{\s*el\.style\.display = el\.dataset\.search\.includes\(q\) \? '' : 'none';\s*\}\);\s*\}/,
    `function filterSuppliers(query) {
    const q = (query || '').toLowerCase();
    document.querySelectorAll('#supplierList .supplier-item').forEach(el => {
      const search = el.dataset.search || '';
      el.style.display = search.includes(q) ? '' : 'none';
    });
  }`
  );

  // exportSupplierPdf: Demais
  c = c.replace(
    /function exportSupplierPdf\(\) \{\s*const selected = Array\.from\(document\.querySelectorAll\('#supplierList input:checked'\)\);\s*if \(!selected\.length\) \{ alert\('Selecione ao menos um fornecedor\.'\); return; \}/,
    `function exportSupplierPdf() {
    const selected = Array.from(document.querySelectorAll('#supplierList .supplier-item input:checked'));
    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
    if (!selected.length && !includeDemais) {
      alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
      return;
    }`
  );

  // buildLojaSupplierReportData call with demais if signature is selected-only
  if (c.includes("function buildLojaSupplierReportData(selected)") && !c.includes("buildLojaSupplierReportData(selected, includeDemais)")) {
    c = c.replace(
      "function buildLojaSupplierReportData(selected) {",
      "function buildLojaSupplierReportData(selected, includeDemais) {"
    );
    // After selected.forEach block, before return — inject demais aggregation if missing in builder
    if (!c.includes("aggregateDemaisLoja(selectedKeys)")) {
      // print already uses aggregateDemaisLoja; extend builder
      c = c.replace(
        /function buildLojaSupplierReportData\(selected, includeDemais\) \{[\s\S]*?return \{\s*suppliers,\s*totalGeral,\s*companyName: getCompanyName\(\),\s*competencia:[\s\S]*?col3Label: 'Finalidade',\s*\};\s*\}/,
        (block) => {
          if (block.includes("includeDemais")) return block;
          return block.replace(
            /return \{\s*suppliers,\s*totalGeral,/,
            `if (includeDemais) {
      const selectedKeys = new Set(selected.map((cb) => cb.dataset.key || cb.dataset.nome || cb.value));
      const demaisRows = aggregateDemaisLoja(selectedKeys);
      const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
      if (demaisRows.length) {
        totalGeral += subtotal;
        suppliers.push({ nome: 'Demais fornecedores', cnpj: '—', uf: '—', rows: demaisRows, subtotal });
      }
    }
    return {
      suppliers,
      totalGeral,`
          );
        }
      );
    }
    c = c.replace(
      "const data = buildLojaSupplierReportData(selected);",
      "const data = buildLojaSupplierReportData(selected, includeDemais);"
    );
  }

  // print selector more specific
  c = c.replace(
    "const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));\n    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;",
    "const selected = Array.from(document.querySelectorAll('#supplierList .supplier-item input:checked'));\n    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;"
  );

  // window exports before DOMContentLoaded
  if (!c.includes("window.openSupplierModal = openSupplierModal")) {
    c = c.replace(
      "  document.addEventListener('DOMContentLoaded', () => {",
      `  window.openSupplierModal = openSupplierModal;
  window.closeSupplierModal = closeSupplierModal;
  window.filterSuppliers = filterSuppliers;
  window.toggleAllSuppliers = toggleAllSuppliers;
  window.printBySupplier = printBySupplier;
  window.exportSupplierPdf = exportSupplierPdf;

  document.addEventListener('DOMContentLoaded', () => {`
    );
  }

  return c;
}

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = patch(before);
  fs.writeFileSync(file, after);
  const s = after;
  console.log(path.basename(file), {
    bar: s.includes('id="fin-supplier-bar"'),
    openSafe: s.includes("Nenhum fornecedor nesta competencia"),
    windowExport: s.includes("window.openSupplierModal = openSupplierModal"),
    modalNone: /\.modal-overlay\s*\{[^}]*display:\s*none/.test(s),
  });
}
