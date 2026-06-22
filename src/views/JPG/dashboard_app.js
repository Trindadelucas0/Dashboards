/* Dashboard JPG — renderização dinâmica a partir de FILIAL_DATA */

const D = FILIAL_DATA;
const PAL = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#f97316','#ec4899'];
const chartInst = {};
const tabsInit = {};

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.07)';
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;

function brl(v) {
  return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function brlK(v) { return 'R$ ' + (Number(v || 0) / 1000).toFixed(1).replace('.', ',') + 'K'; }
function pct(v) { return (v == null ? 'N/D' : Number(v).toFixed(1) + '%'); }
function tip() {
  return { backgroundColor:'#1e2535', borderColor:'rgba(255,255,255,0.1)', borderWidth:1, padding:12, titleColor:'#e2e8f0', bodyColor:'#94a3b8', cornerRadius:8 };
}
function leg() { return { labels:{ usePointStyle:true, padding:16, boxWidth:8, boxHeight:8 } }; }
function safeChart(id, cfg) {
  if (chartInst[id]) chartInst[id].destroy();
  const ctx = document.getElementById(id);
  if (!ctx) return;
  chartInst[id] = new Chart(ctx, cfg);
}
function rankClass(i) { return i === 0 ? 'g1' : i === 1 ? 'g2' : i === 2 ? 'g3' : 'gn'; }
function pbRow(pctVal, color) {
  const w = Math.min(100, Math.max(4, pctVal));
  return '<div class="pb-wrap"><div class="pb-bar"><div class="pb-fill" style="width:'+w+'%;background:'+(color||'var(--accent)')+'"></div></div><div class="pb-pct">'+pctVal.toFixed(1)+'%</div></div>';
}

const tabTitles = {
  'visao-geral': ['Visão Geral', 'Resumo ICMS — ' + D.meta.filial_label],
  'entradas': ['Entradas', 'Compras e recebimentos — ' + D.meta.filial_label],
  'finalidade': ['Finalidade de Entradas', 'Classificação CFOP — ' + D.meta.filial_label],
  'vendas': ['Vendas', 'Faturamento — ' + D.meta.filial_label],
  'dre': ['DRE', 'Resultado operacional — ' + D.meta.filial_label],
};

function showTab(name) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const sec = document.getElementById('tab-' + name);
  const nav = document.getElementById('nav-' + name);
  if (sec) sec.classList.add('active');
  if (nav) nav.classList.add('active');
  const h = tabTitles[name] || ['Dashboard',''];
  document.getElementById('headerTitle').innerHTML = h[0] + ' <span>' + h[1] + '</span>';
  if (!tabsInit[name]) {
    tabsInit[name] = true;
    setTimeout(() => ({ 'visao-geral':initVisaoGeral, entradas:initEntradas, finalidade:initFinalidade, vendas:initVendas, dre:initDRE }[name]?.()), 50);
  }
  if (window.innerWidth <= 768) closeMob();
}

let sbCollapsed = false;
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const mw = document.getElementById('mainWrapper');
  if (window.innerWidth <= 768) {
    sb.classList.toggle('mob-open');
    document.getElementById('overlay').classList.toggle('hidden');
  } else {
    sbCollapsed = !sbCollapsed;
    sb.classList.toggle('collapsed', sbCollapsed);
    mw.classList.toggle('sb-collapsed', sbCollapsed);
  }
}
function closeMob() {
  document.getElementById('sidebar').classList.remove('mob-open');
  document.getElementById('overlay').classList.add('hidden');
}

function kpiCard(color, icon, badge, val, lbl, sub) {
  return '<div class="kpi-card c-'+color+'"><div class="kpi-head"><div class="kpi-ico c-'+color+'"><i class="'+icon+'"></i></div><div class="kpi-badge neutral">'+badge+'</div></div><div class="kpi-val">'+val+'</div><div class="kpi-lbl">'+lbl+'</div><div class="kpi-sub">'+sub+'</div></div>';
}

function initMeta() {
  const m = D.meta;
  document.title = 'Dashboard ' + m.filial_label + ' | JPG';
  document.getElementById('logoCompany').textContent = m.filial_label;
  document.getElementById('logoSubtitle').textContent = m.periodo;
  document.getElementById('sidebarPeriodo').textContent = m.periodo;
  document.getElementById('headerBadge').innerHTML = '<i class="fas fa-building" style="font-size:7px;margin-right:5px;"></i> Filial ' + m.codigo;
  ['vgPeriodo','entPeriodo','finPeriodo','vndPeriodo','drePeriodo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = m.periodo;
  });
  document.getElementById('vgSub').textContent = m.nome + ' — CNPJ ' + m.cnpj + ' — IE ' + m.ie;
  if (m.alerta) {
    const ab = document.getElementById('alertBox');
    ab.style.display = 'block';
    ab.innerHTML = '<i class="fas fa-info-circle" style="margin-right:8px;"></i><strong>Atenção:</strong> ' + m.alerta;
  }
}

function initVisaoGeral() {
  const k = D.kpis;
  document.getElementById('kpiVisao').innerHTML =
    kpiCard('green','fas fa-cart-shopping',D.meta.periodo, brl(k.entradas), 'Total Entradas', k.n_nf_ent + ' NF-e · ' + k.n_fornecedores + ' fornec.') +
    kpiCard('blue','fas fa-store',D.meta.periodo, brl(k.saidas), 'Total Vendas', k.n_nf_sai + ' NF-e · ' + k.n_clientes + ' clientes') +
    kpiCard('yellow','fas fa-file-invoice-dollar','ICMS', brl(k.saldo_icms), 'Saldo ICMS', 'Débito ' + brl(k.icms_debito) + ' − Crédito ' + brl(k.icms_credito)) +
    kpiCard('purple','fas fa-chart-pie','DRE', pct(D.dre.margem_bruta_pct), 'Margem Bruta', 'Lucro bruto ' + brl(D.dre.lucro_bruto));

  safeChart('chartCompBar', {
    type:'bar',
    data:{ labels:['Entradas','Vendas'], datasets:[{ label:'Valor Contábil', data:[k.entradas, k.saidas], backgroundColor:['rgba(16,185,129,0.7)','rgba(59,130,246,0.7)'], borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...tip(), callbacks:{ label:c=>brl(c.parsed.y)} } }, scales:{ y:{ ticks:{ callback:v=>brlK(v*1000) } } } }
  });

  const cfSai = D.cfop_saidas.slice(0,8);
  safeChart('chartCfopSai', {
    type:'doughnut',
    data:{ labels: cfSai.map(c=>c.cfop), datasets:[{ data: cfSai.map(c=>c.total), backgroundColor:PAL, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{...leg(), position:'right'}, tooltip:{...tip(), callbacks:{ label:c=>c.label+': '+brl(c.parsed)} } } }
  });

  const sd = D.serie_diaria;
  safeChart('chartDaily', {
    type:'line',
    data:{ labels: sd.labels, datasets:[
      { label:'Entradas', data:sd.entradas, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.1)', fill:true, tension:0.3 },
      { label:'Vendas', data:sd.saidas, borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.1)', fill:true, tension:0.3 }
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:leg(), tooltip:{...tip(), callbacks:{ label:c=>c.dataset.label+': '+brl(c.parsed.y)} } } }
  });
}

function initEntradas() {
  const k = D.kpis;
  const ufs = Object.keys(D.ufs_entradas);
  document.getElementById('kpiEntradas').innerHTML =
    kpiCard('green','fas fa-boxes-stacked',D.meta.periodo, brl(k.entradas), 'Total Entradas', k.n_nf_ent + ' notas fiscais') +
    kpiCard('blue','fas fa-handshake','—', String(k.n_fornecedores), 'Fornecedores', 'Fornecedores distintos no período') +
    kpiCard('purple','fas fa-map-location-dot','—', ufs.length + ' UF' + (ufs.length!==1?'s':''), 'Estados de Origem', ufs.slice(0,3).join(', ') || '—');

  const top = D.ranking_fornecedores.slice(0,10);
  safeChart('chartFornecedores', {
    type:'bar',
    data:{ labels: top.map(f=>f.nome.substring(0,22)), datasets:[{ data: top.map(f=>f.total/1000), backgroundColor:'rgba(16,185,129,0.7)', borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...tip(), callbacks:{ label:c=>brl(c.parsed.x*1000)} } }, scales:{ x:{ ticks:{ callback:v=>'R$'+v+'K' } } } }
  });

  const ufLabels = Object.keys(D.ufs_entradas);
  const ufVals = ufLabels.map(u=>D.ufs_entradas[u]);
  safeChart('chartUfEnt', {
    type:'doughnut',
    data:{ labels:ufLabels, datasets:[{ data:ufVals, backgroundColor:PAL, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{...leg(), position:'right'}, tooltip:{...tip(), callbacks:{ label:c=>c.label+': '+brl(c.parsed)} } } }
  });

  document.getElementById('tblFornecedores').innerHTML = D.ranking_fornecedores.map((f,i)=>
    '<tr><td><div class="rank '+rankClass(i)+'">'+(i+1)+'</div></td><td><div class="fw7">'+f.nome+'</div><div class="td-mute">'+f.cnpj+'</div></td><td><span class="chip bl">'+f.uf+'</span></td><td class="r td-val">'+brl(f.total)+'</td><td>'+pbRow(f.pct)+'</td><td class="r">'+f.qtd+'</td></tr>'
  ).join('') || '<tr><td colspan="6" class="td-mute">Sem entradas no período</td></tr>';
}

function initFinalidade() {
  const fin = D.finalidade;
  const colors = ['c-blue','c-green','c-orange','c-purple','c-cyan','c-yellow'];
  document.getElementById('kpiFinalidade').innerHTML = fin.slice(0,4).map((f,i)=>
    kpiCard(colors[i%colors.length].replace('c-',''), 'fas fa-tag', f.finalidade.substring(0,18), brl(f.total), f.finalidade, f.pct+'% do total · '+f.qtd+' NF')
  ).join('') || kpiCard('gy','fas fa-minus','—','R$ 0,00','Sem entradas','—');

  safeChart('chartFinalidade', {
    type:'doughnut',
    data:{ labels: fin.map(f=>f.finalidade), datasets:[{ data: fin.map(f=>f.total), backgroundColor:PAL, borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:'50%', plugins:{ legend:{...leg(), position:'right'}, tooltip:{...tip(), callbacks:{ label:c=>c.label+': '+brl(c.parsed)} } } }
  });

  const cf = D.cfop_entradas.slice(0,10);
  safeChart('chartCfopEnt', {
    type:'bar',
    data:{ labels: cf.map(c=>c.cfop), datasets:[{ data: cf.map(c=>c.total/1000), backgroundColor:'rgba(59,130,246,0.7)', borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...tip(), callbacks:{ label:c=>brl(c.parsed.y*1000)} } }, scales:{ y:{ ticks:{ callback:v=>'R$'+v+'K' } } } }
  });

  document.getElementById('tblCfopEnt').innerHTML = D.cfop_entradas.map(c=>
    '<tr><td><span class="chip bl">'+c.cfop+'</span></td><td style="font-size:12px">'+c.descricao+'</td><td><span class="chip pu">'+c.finalidade+'</span></td><td class="r">'+c.qtd+'</td><td class="r td-val">'+brl(c.total)+'</td><td>'+pbRow(c.pct)+'</td></tr>'
  ).join('') || '<tr><td colspan="6" class="td-mute">Sem dados</td></tr>';
}

function initVendas() {
  const k = D.kpis;
  document.getElementById('kpiVendas').innerHTML =
    kpiCard('blue','fas fa-store',D.meta.periodo, brl(k.saidas), 'Total Vendas', k.n_nf_sai + ' notas fiscais') +
    kpiCard('green','fas fa-users','—', String(k.n_clientes), 'Clientes', 'Clientes distintos no período') +
    kpiCard('yellow','fas fa-file-invoice','ICMS', brl(k.icms_debito), 'ICMS Débito', 'Imposto sobre saídas');

  const top = D.ranking_clientes.slice(0,10);
  safeChart('chartClientes', {
    type:'bar',
    data:{ labels: top.map(c=>c.nome.substring(0,22)), datasets:[{ data: top.map(c=>c.total/1000), backgroundColor:'rgba(59,130,246,0.7)', borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...tip(), callbacks:{ label:c=>brl(c.parsed.x*1000)} } }, scales:{ x:{ ticks:{ callback:v=>'R$'+v+'K' } } } }
  });

  const cf = D.cfop_saidas.slice(0,8);
  safeChart('chartCfopVendas', {
    type:'bar',
    data:{ labels: cf.map(c=>c.cfop), datasets:[{ data: cf.map(c=>c.total/1000), backgroundColor:'rgba(139,92,246,0.7)', borderRadius:4 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{...tip(), callbacks:{ label:c=>brl(c.parsed.y*1000)} } }, scales:{ y:{ ticks:{ callback:v=>'R$'+v+'K' } } } }
  });

  document.getElementById('tblClientes').innerHTML = D.ranking_clientes.map((c,i)=>
    '<tr><td><div class="rank '+rankClass(i)+'">'+(i+1)+'</div></td><td><div class="fw7">'+c.nome+'</div><div class="td-mute">'+c.cnpj+'</div></td><td><span class="chip bl">'+c.uf+'</span></td><td class="r td-val">'+brl(c.total)+'</td><td>'+pbRow(c.pct)+'</td><td class="r">'+c.qtd+'</td></tr>'
  ).join('') || '<tr><td colspan="6" class="td-mute">Sem vendas a clientes no período</td></tr>';
}

function initDRE() {
  const d = D.dre;
  const isMatriz = D.meta.filial_key === 'MATRIZ';
  document.getElementById('dreMargins').innerHTML =
    '<div class="margin-card"><div class="margin-val t-accent">'+brl(d.receita)+'</div><div class="margin-lbl">Receita Bruta</div><div class="margin-sub">Saídas ICMS</div></div>' +
    '<div class="margin-card"><div class="margin-val">'+brl(d.cmv)+'</div><div class="margin-lbl">CMV (Entradas)</div><div class="margin-sub">Custo das mercadorias</div></div>' +
    '<div class="margin-card"><div class="margin-val t-success">'+pct(d.margem_bruta_pct)+'</div><div class="margin-lbl">Margem Bruta</div><div class="margin-sub">Lucro bruto '+brl(d.lucro_bruto)+'</div></div>' +
    '<div class="margin-card"><div class="margin-val '+(d.resultado>=0?'t-success':'t-danger')+'">'+brl(d.resultado)+'</div><div class="margin-lbl">Resultado Operacional</div><div class="margin-sub">Após saldo ICMS</div></div>';

  let rows = '';
  rows += '<tr class="dre-group"><td colspan="2">RECEITAS</td></tr>';
  rows += '<tr><td>Receita Bruta (Saídas)</td><td class="r td-val">'+brl(d.receita)+'</td></tr>';
  if (isMatriz && d.receita_externa !== d.receita) {
    rows += '<tr class="dre-indent"><td>Receita Externa (sem transferências)</td><td class="r">'+brl(d.receita_externa)+'</td></tr>';
  }
  rows += '<tr class="dre-group"><td colspan="2">CUSTOS</td></tr>';
  rows += '<tr><td>(−) CMV — Entradas</td><td class="r dre-neg">('+brl(d.cmv).replace('R$ ','R$ ')+')</td></tr>';
  rows += '<tr class="dre-total"><td>(=) Lucro Bruto</td><td class="r">'+brl(d.lucro_bruto)+'</td></tr>';
  rows += '<tr class="dre-group"><td colspan="2">IMPOSTOS (ICMS)</td></tr>';
  rows += '<tr class="dre-indent"><td>(−) ICMS Débito (Saídas)</td><td class="r">('+brl(d.icms_debito)+')</td></tr>';
  rows += '<tr class="dre-indent"><td>(+) ICMS Crédito (Entradas)</td><td class="r t-success">'+brl(d.icms_credito)+'</td></tr>';
  rows += '<tr><td>Saldo ICMS</td><td class="r td-val">'+brl(d.saldo_icms)+'</td></tr>';
  rows += '<tr class="dre-lucro"><td>(=) Resultado Operacional (proxy)</td><td class="r">'+brl(d.resultado)+'</td></tr>';
  rows += '<tr class="dre-nd"><td colspan="2">PIS, COFINS, IRPJ e CSLL não disponíveis neste relatório ICMS.</td></tr>';
  document.getElementById('tblDre').innerHTML = rows;
}

async function exportPDF(sectionId, filename) {
  const section = document.getElementById(sectionId);
  if (!section || !window.html2canvas || !window.jspdf) return;
  const btn = event?.currentTarget;
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
  try {
    section.classList.add('pdf-export-target');
    const canvas = await html2canvas(section, { scale:2, backgroundColor:'#f8fafc', useCORS:true });
    section.classList.remove('pdf-export-target');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, Math.min(h, 290));
    pdf.save(filename + '_' + D.meta.filial_label.replace(/\s/g,'_') + '.pdf');
  } catch(e) { console.error(e); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
}

document.addEventListener('DOMContentLoaded', () => {
  initMeta();
  showTab('visao-geral');
});
