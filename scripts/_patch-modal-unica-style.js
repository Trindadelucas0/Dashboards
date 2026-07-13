/**
 * Padroniza modal "Imprimir por Fornecedor" (estilo UNICA) em Finalidade de Compras.
 * Fontes: BAIFER, DU LANCHE, EGAPLAST + Demais em Loja/Schumacher.
 *
 * REGRESSAO: patchAppJs deve substituir SOMENTE o bloco do modal
 * (helpers supplier* / openSupplierModal / printBySupplier / exportSupplierPdf)
 * imediatamente antes de closeDrilldown. Nao cortar getCfopDados, painel legado
 * nem exports de funcoes inexistentes.
 */
const fs = require("fs");
const path = require("path");

const root = "c:/Users/trind/Desktop/dashboards";

const MODAL_HTML = `<!-- MODAL: Impressão por Fornecedor (Finalidade de Compras) -->
<div class="modal-overlay" id="supplierModal" style="display:none;" onclick="if(event.target===this)closeSupplierModal()">
  <div class="modal-box">
    <div class="modal-header">
      <h3><i class="fas fa-truck"></i> Imprimir por Fornecedor</h3>
      <button type="button" onclick="closeSupplierModal()" class="modal-close">&times;</button>
    </div>
    <div class="modal-body">
      <div class="search-box">
        <label for="supplierReportPeriod" style="display:block;font-size:12px;font-weight:600;margin-bottom:6px;">
          Competência do relatório
        </label>
        <select id="supplierReportPeriod" class="period-sel" style="width:100%;" onchange="onSupplierReportPeriodChange()"></select>
      </div>
      <div class="search-box">
        <input type="text" id="supplierSearch" placeholder="Buscar fornecedor..." oninput="filterSuppliers(this.value)">
      </div>
      <div class="supplier-actions">
        <button type="button" onclick="toggleAllSuppliers(true)">Selecionar Todos</button>
        <button type="button" onclick="toggleAllSuppliers(false)">Limpar Seleção</button>
      </div>
      <label class="supplier-item supplier-item-demais" id="demaisFornecedoresOption">
        <input type="checkbox" id="includeDemaisFornecedores" checked>
        <span class="supplier-info">
          <strong>Demais fornecedores</strong>
          <small>Agrupa fornecedores não selecionados por CFOP</small>
        </span>
      </label>
      <div class="supplier-list" id="supplierList"></div>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn-cancel" onclick="closeSupplierModal()">Cancelar</button>
      <button type="button" class="btn-confirm" onclick="printBySupplier()"><i class="fas fa-print"></i> Imprimir Selecionados</button>
      <button type="button" class="btn-confirm btn-pdf-supplier" onclick="exportSupplierPdf()" style="background:#ef4444;"><i class="fas fa-file-pdf"></i> Baixar PDF</button>
    </div>
  </div>
</div>`;

function replaceModal(html) {
  const re = /<!-- MODAL[\s\S]*?<div class="modal-overlay" id="supplierModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
  if (!re.test(html)) {
    // fallback: from supplierModal to closing before script
    const re2 = /<div class="modal-overlay" id="supplierModal"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/;
    if (!re2.test(html)) throw new Error("modal not found");
    return html.replace(re2, MODAL_HTML);
  }
  return html.replace(re, MODAL_HTML);
}

function fixFinalidadeButton(html) {
  return html
    .replace(
      /onclick="toggleFornecedorPanel\(\)" title="Ver por Fornecedor"/g,
      'onclick="openSupplierModal()" title="Imprimir por Fornecedor"'
    )
    .replace(
      /id="btn-fornecedor-panel" onclick="toggleFornecedorPanel\(\)"/g,
      'id="btn-fornecedor-panel" onclick="openSupplierModal()"'
    );
}

const APP_MODAL_LOGIC = `
  function supplierKey(f) {
    return (f.cnpj && String(f.cnpj).trim()) || f.nome;
  }

  function getSupplierReportPeriodKey() {
    const sel = document.getElementById('supplierReportPeriod');
    return (sel && sel.value) || (state.fiscalMode === 'month' ? state.month : (state.fiscalMode || state.month));
  }

  function getPackForSupplierReport(periodKey) {
    if (periodKey === 'total') return buildFiscalTotalPack();
    if (periodKey === 'q1' || periodKey === 'q2') return buildFiscalTrimPack(periodKey);
    const fp = getUnitFiscal();
    return fp.porMes[periodKey] || null;
  }

  function periodLabelForReport(periodKey) {
    if (periodKey === 'total') return PERIODO_TOTAL.label;
    if (periodKey === 'q1' && TRIMESTRES.q1) return TRIMESTRES.q1.label;
    if (periodKey === 'q2' && TRIMESTRES.q2) return TRIMESTRES.q2.label;
    return (MONTH_LABELS[periodKey] || periodKey) + ' / 2026';
  }

  function hydrateSupplierReportPeriodSelect() {
    const sel = document.getElementById('supplierReportPeriod');
    if (!sel) return;
    let html = '';
    MONTH_KEYS.forEach((m) => {
      html += '<option value="' + m + '">' + MONTH_LABELS[m] + ' / 2026</option>';
    });
    if (TRIMESTRES.q1) html += '<option value="q1">' + TRIMESTRES.q1.label + '</option>';
    if (TRIMESTRES.q2) html += '<option value="q2">' + TRIMESTRES.q2.label + '</option>';
    html += '<option value="total">' + PERIODO_TOTAL.label + '</option>';
    sel.innerHTML = html;
    if (state.fiscalMode === 'month') sel.value = state.month;
    else if (state.fiscalMode === 'q1' || state.fiscalMode === 'q2' || state.fiscalMode === 'total') sel.value = state.fiscalMode;
    else sel.value = state.month;
  }

  function getCfopDadosForPrint() {
    const pack = getPackForSupplierReport(getSupplierReportPeriodKey());
    return (pack && pack.cfopEntradas) || [];
  }

  function collectUniqueSuppliers() {
    const map = new Map();
    getCfopDadosForPrint().forEach((cfop) => {
      (cfop.fornecedores || []).forEach((f) => {
        const key = supplierKey(f);
        if (!key || map.has(key)) return;
        map.set(key, { nome: f.nome, cnpj: f.cnpj || '—', uf: f.uf || '—', key: key });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  function renderSupplierList() {
    const list = document.getElementById('supplierList');
    if (!list) return;
    const suppliers = collectUniqueSuppliers();
    list.innerHTML = suppliers.map((s) => {
      const search = (s.nome + ' ' + s.cnpj + ' ' + s.uf).toLowerCase();
      return '<label class="supplier-item" data-search="' + escHtml(search) + '">' +
        '<input type="checkbox" value="' + escHtml(s.cnpj) + '" data-key="' + escHtml(s.key) + '" data-nome="' + escHtml(s.nome) + '" data-uf="' + escHtml(s.uf) + '">' +
        '<span class="supplier-info"><strong>' + escHtml(s.nome) + '</strong>' +
        '<small>' + escHtml(s.cnpj) + ' · ' + escHtml(s.uf) + '</small></span></label>';
    }).join('') || '<p class="td-mute" style="padding:16px;">Nenhum fornecedor nesta competência.</p>';
  }

  function rowsForSupplierPrint(cfopDados, key, nome) {
    const rows = [];
    cfopDados.forEach((c) => {
      const f = (c.fornecedores || []).find((x) => supplierKey(x) === key || x.nome === nome);
      if (!f) return;
      let desc = c.descricao || ('CFOP ' + c.cfop);
      let fin = c.finalidade || c.grupo || '—';
      if (typeof cfopDescricaoFromItem === 'function') desc = cfopDescricaoFromItem(c);
      if (typeof cfopFinalidadeFromItem === 'function') fin = cfopFinalidadeFromItem(c);
      else if (typeof cfopGrupoFromItem === 'function') fin = cfopGrupoFromItem(c);
      else if (typeof getCfopInfo === 'function') {
        const info = getCfopInfo(c.cfop);
        desc = info.descricao || desc;
        fin = info.finalidade || info.grupo || fin;
      }
      rows.push({ cfop: c.cfop, desc: desc, fin: fin, qtd: f.qtd || 0, total: f.total || 0 });
    });
    return rows.sort((a, b) => b.total - a.total);
  }

  function aggregateDemaisByCfop(cfopDados, selectedKeys) {
    const map = {};
    cfopDados.forEach((c) => {
      (c.fornecedores || []).forEach((f) => {
        const key = supplierKey(f);
        if (!key || selectedKeys.has(key)) return;
        if (!map[c.cfop]) {
          let desc = c.descricao || ('CFOP ' + c.cfop);
          let fin = c.finalidade || c.grupo || '—';
          if (typeof cfopDescricaoFromItem === 'function') desc = cfopDescricaoFromItem(c);
          if (typeof cfopFinalidadeFromItem === 'function') fin = cfopFinalidadeFromItem(c);
          else if (typeof cfopGrupoFromItem === 'function') fin = cfopGrupoFromItem(c);
          map[c.cfop] = { cfop: c.cfop, desc: desc, fin: fin, qtd: 0, total: 0 };
        }
        map[c.cfop].qtd += f.qtd || 0;
        map[c.cfop].total += f.total || 0;
      });
    });
    return Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  }

  function buildModalSupplierReportData() {
    const selected = Array.from(document.querySelectorAll('#supplierList input[type="checkbox"]:checked'));
    const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
    if (!selected.length && !includeDemais) {
      return { error: 'Selecione ao menos um fornecedor ou marque "Demais fornecedores".' };
    }
    const periodKey = getSupplierReportPeriodKey();
    const cfopDados = getCfopDadosForPrint();
    if (!cfopDados.length) return { error: 'Sem entradas para a competência selecionada.' };
    const selectedKeys = new Set(selected.map((cb) => cb.dataset.key || cb.dataset.nome || cb.value));
    const suppliers = [];
    let totalGeral = 0;
    selected.forEach((cb) => {
      const key = cb.dataset.key || cb.dataset.nome || cb.value;
      const nome = cb.dataset.nome || '';
      const rows = rowsForSupplierPrint(cfopDados, key, nome);
      const subtotal = rows.reduce((s, r) => s + r.total, 0);
      if (!rows.length) return;
      totalGeral += subtotal;
      suppliers.push({ nome: nome, cnpj: cb.value || '—', uf: cb.dataset.uf || '—', rows: rows, subtotal: subtotal });
    });
    if (includeDemais) {
      const demaisRows = aggregateDemaisByCfop(cfopDados, selectedKeys);
      const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
      if (demaisRows.length) {
        totalGeral += subtotal;
        suppliers.push({ nome: 'Demais fornecedores', cnpj: '—', uf: '—', rows: demaisRows, subtotal: subtotal });
      }
    }
    if (totalGeral <= 0) {
      return { error: 'Nenhum dado encontrado para os fornecedores selecionados neste período.' };
    }
    let col3 = 'Finalidade';
    if (typeof cfopGrupoFromItem === 'function' && typeof cfopFinalidadeFromItem !== 'function') col3 = 'Grupo';
    return {
      suppliers: suppliers,
      totalGeral: totalGeral,
      companyName: getCompanyName(),
      competencia: periodLabelForReport(periodKey),
      col3Label: col3,
    };
  }

  function openSupplierModal() {
    const modal = document.getElementById('supplierModal');
    if (!modal) {
      alert('Modal de fornecedores nao encontrado nesta pagina.');
      return;
    }
    hydrateSupplierReportPeriodSelect();
    renderSupplierList();
    const search = document.getElementById('supplierSearch');
    if (search) search.value = '';
    const demais = document.getElementById('includeDemaisFornecedores');
    if (demais) demais.checked = true;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeSupplierModal() {
    const modal = document.getElementById('supplierModal');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
    const search = document.getElementById('supplierSearch');
    if (search) search.value = '';
  }

  function onSupplierReportPeriodChange() {
    renderSupplierList();
    const search = document.getElementById('supplierSearch');
    if (search) search.value = '';
  }

  function filterSuppliers(q) {
    const term = (q || '').toLowerCase();
    document.querySelectorAll('#supplierList .supplier-item').forEach((el) => {
      if (el.id === 'demaisFornecedoresOption' || el.classList.contains('supplier-item-demais')) return;
      el.style.display = (el.dataset.search || '').includes(term) ? '' : 'none';
    });
  }

  function toggleAllSuppliers(st) {
    document.querySelectorAll('#supplierList .supplier-item input[type="checkbox"]').forEach((cb) => {
      const row = cb.closest('.supplier-item');
      if (row && row.style.display === 'none') return;
      cb.checked = st;
    });
  }

  function printBySupplier() {
    const data = buildModalSupplierReportData();
    if (data.error) { alert(data.error); return; }
    let html = '<div style="font-family:Inter,sans-serif;padding:24px;color:#1a1a2e;background:#fff;">';
    html += '<h1 style="font-size:18px;margin-bottom:4px;">Relatório por Fornecedor</h1>';
    html += '<p style="font-size:12px;color:#555;margin-bottom:24px;">' +
      escHtml(data.companyName) + ' — Competência ' + escHtml(data.competencia) + ' — ' +
      new Date().toLocaleDateString('pt-BR') + '</p>';
    data.suppliers.forEach((s) => {
      html += '<div style="margin-bottom:28px;page-break-inside:avoid;">';
      html += '<h2 style="font-size:14px;border-bottom:2px solid #22a329;padding-bottom:6px;">' + escHtml(s.nome) + '</h2>';
      html += '<p style="font-size:11px;color:#555;">CNPJ: ' + escHtml(s.cnpj) + ' · UF: ' + escHtml(s.uf) + '</p>';
      html += '<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:12px;">';
      html += '<thead><tr style="background:#f0f0f0;"><th style="padding:8px;text-align:left;">CFOP</th>';
      html += '<th style="padding:8px;text-align:left;">Descrição</th><th style="padding:8px;text-align:left;">' + escHtml(data.col3Label) + '</th>';
      html += '<th style="padding:8px;text-align:right;">Qtd NFs</th><th style="padding:8px;text-align:right;">Valor (R$)</th></tr></thead><tbody>';
      s.rows.forEach((r) => {
        html += '<tr><td style="padding:8px;border-bottom:1px solid #ddd;">' + escHtml(r.cfop) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;">' + escHtml(r.desc) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;">' + escHtml(r.fin) + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">' + r.qtd + '</td>';
        html += '<td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;font-weight:600;">' +
          r.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr>';
      });
      html += '</tbody><tfoot><tr><td colspan="4" style="padding:10px;text-align:right;font-weight:700;">Subtotal:</td>';
      html += '<td style="padding:10px;text-align:right;font-weight:700;">R$ ' +
        s.subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</td></tr></tfoot></table></div>';
    });
    html += '<div style="border-top:2px solid #1a1a2e;padding-top:12px;margin-top:16px;text-align:right;font-size:14px;font-weight:700;">';
    html += 'Total Geral: R$ ' + data.totalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) + '</div></div>';
    closeSupplierModal();
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
  }

  function exportSupplierPdf() {
    const data = buildModalSupplierReportData();
    if (data.error) { alert(data.error); return; }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('Biblioteca jsPDF nao carregada.');
      return;
    }
    if (typeof window.jspdf.jsPDF.prototype.autoTable !== 'function') {
      alert('Biblioteca jspdf-autotable nao carregada.');
      return;
    }
    closeSupplierModal();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageH = pdf.internal.pageSize.getHeight();
    let y = margin;
    const fmtBrl = (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ensureSpace = (need) => {
      if (y + need > pageH - margin) { pdf.addPage(); y = margin; }
    };
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('Relatorio por Fornecedor', margin, y);
    y += 7;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(80, 80, 80);
    pdf.text(data.companyName + ' — Competencia ' + data.competencia + ' — ' + new Date().toLocaleDateString('pt-BR'), margin, y);
    y += 10;
    pdf.setTextColor(0, 0, 0);
    data.suppliers.forEach((s) => {
      ensureSpace(20);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(String(s.nome || '').slice(0, 90), margin, y);
      y += 5;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.text('CNPJ: ' + s.cnpj + ' · UF: ' + s.uf, margin, y);
      y += 4;
      pdf.setTextColor(0, 0, 0);
      pdf.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['CFOP', 'Descricao', data.col3Label, 'Qtd NFs', 'Valor (R$)']],
        body: s.rows.map((r) => [r.cfop, r.desc, r.fin, String(r.qtd), fmtBrl(r.total)]),
        foot: [['', '', '', 'Subtotal:', fmtBrl(s.subtotal)]],
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [34, 163, 41], textColor: 255 },
        footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: 'bold' },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } },
      });
      y = pdf.lastAutoTable.finalY + 8;
    });
    ensureSpace(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('Total Geral: ' + fmtBrl(data.totalGeral), margin, y);
    const safe = String(data.companyName || 'empresa').slice(0, 24).replace(/[\\/:*?"<>|]/g, '');
    pdf.save('relatorio-fornecedor-' + safe + '.pdf');
  }
`;

function patchAppJs(file) {
  let js = fs.readFileSync(file, "utf8");

  // IMPORTANTE: nao cortar helpers de painel/drilldown (getCfopDados, toggleFornecedorPanel, etc.).
  // Substituir somente o bloco do modal de impressao (openSupplierModal .. exportSupplierPdf),
  // imediatamente antes de closeDrilldown.

  const end = js.indexOf("\n  function closeDrilldown()");
  if (end < 0) {
    throw new Error("closeDrilldown marker not found in " + file);
  }

  // Preferir inicio em openSupplierModal; se nao houver, em getCompanyName logo antes do modal.
  let start = js.lastIndexOf("  function openSupplierModal() {", end);
  if (start < 0) {
    start = js.lastIndexOf("  function getCompanyName() {", end);
  }
  if (start < 0) {
    // Inserir antes de closeDrilldown sem apagar nada anterior
    start = end;
  } else {
    // Se getCompanyName estiver colado ao bloco modal, incluir; se houver codigo entre
    // getCompanyName e openSupplierModal que nao seja do modal, recuar so ate openSupplierModal.
    const openIdx = js.lastIndexOf("  function openSupplierModal() {", end);
    if (openIdx >= 0) start = openIdx;
    // Tambem remova funcoes auxiliares do modal imediatamente acima de openSupplierModal
    const modalHelpers = [
      "  function buildModalSupplierReportData()",
      "  function aggregateDemaisByCfop(",
      "  function rowsForSupplierPrint(",
      "  function renderSupplierList()",
      "  function collectUniqueSuppliers()",
      "  function getCfopDadosForPrint()",
      "  function hydrateSupplierReportPeriodSelect()",
      "  function periodLabelForReport(",
      "  function getPackForSupplierReport(",
      "  function getSupplierReportPeriodKey()",
      "  function supplierKey(",
      "  function getCompanyName()",
    ];
    let earliest = start;
    for (const h of modalHelpers) {
      const i = js.lastIndexOf(h, start);
      if (i >= 0 && i < earliest) {
        // Confirma que nao ha closeDrilldown / init entre i e start (bloco continuo)
        const between = js.slice(i, start);
        if (!between.includes("function closeDrilldown") && !between.includes("function initFinalidade")) {
          earliest = i;
        }
      }
    }
    start = earliest;
  }

  const companyDefault = file.includes("egaplast")
    ? "EGAPLAST"
    : file.includes("du-lanche")
      ? "DU LANCHE"
      : "BAIFER";

  const companyFn = `
  function getCompanyName() {
    return document.querySelector('.logo-text .company')?.textContent?.trim() || '${companyDefault}';
  }
`;

  // Garante getCfopDados fora da zona substituida (antes do bloco injetado)
  const cfopDadosGuard = `
  function getCfopDados() {
    if (typeof getPack === 'function') {
      const pack = getPack();
      return (pack && pack.cfopEntradas) || [];
    }
    return [];
  }
`;

  let prefix = js.slice(0, start);
  if (!prefix.includes("function getCfopDados(")) {
    prefix += cfopDadosGuard;
  }
  if (!/\blet activeDrilldownCfop\b/.test(js) && !/\blet activeDrilldownCfop\b/.test(prefix)) {
    prefix = prefix.replace(
      /(let state = \{[^}]+\};)/,
      "$1\n  let activeDrilldownCfop = null;"
    );
  }

  js = prefix + companyFn + APP_MODAL_LOGIC + js.slice(end);

  // Remover chamada legado quebrada se ainda existir
  js = js.replace(/\n\s*if \(isFornecedorPanelOpen\(\)\) renderFornecedorPanel\(\);\n/g, "\n");

  if (!js.includes("window.closeSupplierModal")) {
    js = js.replace(
      "window.openSupplierModal = openSupplierModal;",
      "window.openSupplierModal = openSupplierModal;\n  window.closeSupplierModal = closeSupplierModal;\n  window.onSupplierReportPeriodChange = onSupplierReportPeriodChange;\n  window.filterSuppliers = filterSuppliers;\n  window.toggleAllSuppliers = toggleAllSuppliers;"
    );
  }
  if (!js.includes("window.exportSupplierPdf = exportSupplierPdf")) {
    js = js.replace(
      "window.printBySupplier = printBySupplier;",
      "window.printBySupplier = printBySupplier;\n  window.exportSupplierPdf = exportSupplierPdf;"
    );
  } else if (!js.includes("window.printBySupplier = printBySupplier")) {
    js = js.replace(
      "window.openSupplierModal = openSupplierModal;",
      "window.openSupplierModal = openSupplierModal;\n  window.printBySupplier = printBySupplier;\n  window.exportSupplierPdf = exportSupplierPdf;"
    );
  }

  // Remover exports fantasma (funcoes de painel que podem nao existir apos patch)
  const phantomExports = [
    "toggleFornecedorPanel",
    "closeFornecedorPanel",
    "filterFornecedorPanel",
    "filterFornecedorPicker",
    "toggleFornecedorPicker",
    "toggleAllFornecedorPicker",
    "selectTopFornecedores",
    "onFornecedorPickerChange",
    "showFornecedorDetail",
  ];
  for (const name of phantomExports) {
    const hasFn = new RegExp("function\\s+" + name + "\\s*\\(").test(js);
    if (!hasFn) {
      js = js.replace(new RegExp("\\n\\s*window\\." + name + "\\s*=\\s*" + name + "\\s*;", "g"), "");
    }
  }

  fs.writeFileSync(file, js);
  console.log("APP", path.basename(file));
}

function patchHtml(file) {
  let html = fs.readFileSync(file, "utf8");
  html = fixFinalidadeButton(html);
  html = replaceModal(html);
  fs.writeFileSync(file, html);
  console.log("HTML", path.basename(file));
}

// --- BAIFER / DU / EGAPLAST ---
const targets = [
  {
    html: path.join(root, "DASH/BAIFER DASHBOARD/baifer.html"),
    app: path.join(root, "DASH/BAIFER DASHBOARD/baifer-app.js"),
  },
  {
    html: path.join(root, "DASH/du lanches/du-lanche.html"),
    app: path.join(root, "DASH/du lanches/du-lanche-app.js"),
  },
  {
    html: path.join(root, "egaplast att com cfop/EGAPLAST.html"),
    app: path.join(root, "egaplast att com cfop/egaplast-app.js"),
  },
];

for (const t of targets) {
  patchHtml(t.html);
  patchAppJs(t.app);
}

// --- Loja: add Demais fornecedores to modal if missing ---
{
  const file = path.join(root, "lojja/LOJA-MAQUINAS.html");
  let html = fs.readFileSync(file, "utf8");
  if (!html.includes("includeDemaisFornecedores")) {
    html = html.replace(
      /<div class="supplier-actions">\s*<button type="button" onclick="toggleAllSuppliers\(true\)">Selecionar Todos<\/button>\s*<button type="button" onclick="toggleAllSuppliers\(false\)">Limpar Seleção<\/button>\s*<\/div>\s*<div class="supplier-list" id="supplierList"><\/div>/,
      `<div class="supplier-actions">
        <button type="button" onclick="toggleAllSuppliers(true)">Selecionar Todos</button>
        <button type="button" onclick="toggleAllSuppliers(false)">Limpar Seleção</button>
      </div>
      <label class="supplier-item supplier-item-demais" id="demaisFornecedoresOption">
        <input type="checkbox" id="includeDemaisFornecedores" checked>
        <span class="supplier-info">
          <strong>Demais fornecedores</strong>
          <small>Agrupa fornecedores não selecionados por CFOP</small>
        </span>
      </label>
      <div class="supplier-list" id="supplierList"></div>`
    );
    fs.writeFileSync(file, html);
    console.log("LOJA modal Demais ok");
  } else {
    console.log("LOJA ja tem Demais");
  }
}

// --- Schumacher HTML ---
{
  const file = path.join(root, "DASH/shumacher/SCHUMACHER.html");
  let html = fs.readFileSync(file, "utf8");
  if (!html.includes("includeDemaisFornecedores")) {
    html = html.replace(
      /<div class="supplier-actions">[\s\S]*?<\/div>\s*<div class="supplier-list" id="supplierList"><\/div>/,
      `<div class="supplier-actions">
        <button type="button" onclick="toggleAllSuppliers(true)">Selecionar Todos</button>
        <button type="button" onclick="toggleAllSuppliers(false)">Limpar Seleção</button>
      </div>
      <label class="supplier-item supplier-item-demais" id="demaisFornecedoresOption">
        <input type="checkbox" id="includeDemaisFornecedores" checked>
        <span class="supplier-info">
          <strong>Demais fornecedores</strong>
          <small>Agrupa fornecedores não selecionados por CFOP</small>
        </span>
      </label>
      <div class="supplier-list" id="supplierList"></div>`
    );
    fs.writeFileSync(file, html);
    console.log("SCHUMACHER modal Demais ok");
  } else {
    console.log("SCHUMACHER ja tem Demais");
  }
}

console.log("PATCH DONE");
