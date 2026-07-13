const fs = require("fs");
const f = "c:/Users/trind/Desktop/dashboards/Dashboards/src/views/jpg.ejs";
let h = fs.readFileSync(f, "utf8");
if (h.includes("includeDemaisFornecedores")) {
  console.log("already");
  process.exit(0);
}
const re =
  /(<div class="supplier-actions">[\s\S]*?<\/div>)\s*(<div class="supplier-list" id="supplierList"><\/div>)/;
if (!re.test(h)) throw new Error("pattern not found");
h = h.replace(
  re,
  `$1
      <label class="supplier-item supplier-item-demais" id="demaisFornecedoresOption">
        <input type="checkbox" id="includeDemaisFornecedores" checked>
        <span class="supplier-info">
          <strong>Demais fornecedores</strong>
          <small>Agrupa fornecedores nao selecionados por CFOP</small>
        </span>
      </label>
      $2`
);

// patch printBySupplier to accept Demais
h = h.replace(
  `function printBySupplier() {
  const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
  if (!selected.length) { alert('Selecione ao menos um fornecedor.'); return; }
  const { suppliers, totalGeral, periodo, empresa, label } = buildSupplierReportData(selected);
  closeSupplierModal();`,
  `function printBySupplier() {
  const selected = Array.from(document.querySelectorAll('#supplierList input:checked'));
  const includeDemais = document.getElementById('includeDemaisFornecedores')?.checked;
  if (!selected.length && !includeDemais) {
    alert('Selecione ao menos um fornecedor ou marque "Demais fornecedores".');
    return;
  }
  let { suppliers, totalGeral, periodo, empresa, label } = buildSupplierReportData(selected);
  if (includeDemais) {
    const ctx = jpgSupplierCtx;
    const cfops = ctx && ctx.data ? ctx.data.cfop_entradas || [] : [];
    const selectedKeys = new Set(selected.map((cb) => cb.value || cb.dataset.nome));
    const map = {};
    cfops.forEach((cfop) => {
      (cfop.parties || []).forEach((f) => {
        const key = (f.cnpj && String(f.cnpj).trim()) || f.nome;
        if (!key || selectedKeys.has(key)) return;
        if (!map[cfop.cfop]) {
          map[cfop.cfop] = { cfop: cfop.cfop, desc: cfop.descricao, fin: cfop.finalidade, qtd: 0, total: 0 };
        }
        map[cfop.cfop].qtd += f.qtd || 0;
        map[cfop.cfop].total += f.total || 0;
      });
    });
    const demaisRows = Object.values(map).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
    if (demaisRows.length) {
      const subtotal = demaisRows.reduce((s, r) => s + r.total, 0);
      suppliers = suppliers.concat([{ nome: 'Demais fornecedores', cnpj: '—', uf: '—', rows: demaisRows, subtotal }]);
      totalGeral += subtotal;
    }
  }
  if (totalGeral <= 0) {
    alert('Nenhum dado encontrado para os fornecedores selecionados neste período.');
    return;
  }
  closeSupplierModal();`
);

fs.writeFileSync(f, h);
console.log("JPG Demais patched");
