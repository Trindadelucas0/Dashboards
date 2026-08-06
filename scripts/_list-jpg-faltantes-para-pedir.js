'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOL = 0.02;
const near = (a, b) => Math.abs(Number(a) - Number(b)) <= TOL;

function findObjectLiteral(html, marker) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error('marker not found');
  const start = html.indexOf('{', i);
  let depth = 0, inStr = false, quote = '', esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(start, j + 1);
    }
  }
  throw new Error('unclosed');
}

const html = fs.readFileSync(path.join(ROOT, 'src', 'views', 'jpg.ejs'), 'utf8');
const data = JSON.parse(findObjectLiteral(html, 'const JPG_DATA ='));
const tax = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw', 'impostos-grupo-jpg.json'), 'utf8'));
const taxBy = {};
for (const r of tax.rows) {
  if (!taxBy[r.mes]) taxBy[r.mes] = {};
  taxBy[r.mes][r.unit] = r;
}

const units = ['MG', 'PR', 'SP', 'MATRIZ', 'SEDE'];
const labels = {
  MG: 'Filial MG (0005-99)',
  PR: 'Filial PR (0006-70)',
  SP: 'Filial SP (0007-50)',
  MATRIZ: 'Filial DF (0003-27)',
  SEDE: 'Matriz Sede (0001-65)',
};
const meses = (data.fiscalPorMes.meses || []).sort();

const pedirMovimento = [];
const pedirImpostosAlinhar = [];
const pedirOutros = [];
const okItems = [];

for (const mes of meses) {
  const pack = data.fiscalPorMes.porMes[mes];
  for (const u of units) {
    const f = pack.filiais[u];
    const k = f.kpis || {};
    const t = taxBy[mes] && taxBy[mes][u];
    const hasMov = (k.entradas || 0) > TOL || (k.saidas || 0) > TOL;
    const hasAp = !!(f.apuracao && f.apuracao.icms);
    const taxAligned = !!(t && hasAp
      && near(f.apuracao.icms.aRecolher, t.icms_a_recolher)
      && near(f.apuracao.ipi.aRecolher, t.ipi_a_recolher));
    const taxOnKpi = !!(t
      && near(k.ipi_ent, t.ipi_ent)
      && near(k.ipi_sai, t.ipi_sai)
      && near(k.icms_credito, t.icms_credito)
      && near(k.icms_debito, t.icms_debito));

    const id = `${labels[u]} · ${mes}`;
    if (!hasMov) {
      // SEDE can legitimately have 0 saidas some months
      if (u === 'SEDE' && (k.entradas || 0) > TOL) {
        // ok partial
      } else if (u === 'SEDE' && mes !== '2026-02' && mes !== '2026-04' && mes !== '2026-05' && mes !== '2026-06' && mes !== '2026-07') {
        // jan has tiny saidas, mar has saidas
      } else if (u === 'MATRIZ' || (!hasMov && u !== 'SEDE')) {
        if (u === 'MATRIZ' && mes !== '2026-07') {
          pedirMovimento.push({
            unidade: labels[u],
            mes,
            oQue: 'Entradas + Saídas EXITO (.xls) da Filial DF',
            motivo: 'Hoje só tem impostos; compras/vendas estão zeradas',
          });
        } else if (u !== 'MATRIZ' && u !== 'SEDE' && !hasMov) {
          pedirMovimento.push({
            unidade: labels[u],
            mes,
            oQue: `Entradas + Saídas EXITO (.xls)`,
            motivo: 'Sem movimento no dashboard',
          });
        }
      }
    }

    if (t && !taxAligned) {
      pedirImpostosAlinhar.push({
        unidade: labels[u],
        mes,
        oQue: 'Já existe na planilha grupo — falta overlay oficial na memória/KPIs',
        motivo: taxOnKpi
          ? 'KPI ICMS/IPI já bate, mas memória (apuracao) não foi montada com a planilha'
          : `KPI difere da planilha (ICMS créd kpi=${k.icms_credito} plan=${t.icms_credito}; IPI créd kpi=${k.ipi_ent} plan=${t.ipi_ent})`,
        planilhaTem: true,
      });
    }

    if (hasMov && (u === 'SEDE' || (u === 'MATRIZ' && mes === '2026-07') || (u !== 'MATRIZ' && u !== 'SEDE'))) {
      if (u === 'SEDE' || (u === 'MATRIZ' && mes === '2026-07') || (hasMov && taxOnKpi)) {
        okItems.push(id + (hasMov ? ' movimento' : '') + (taxAligned ? ' + imposto/memória' : ''));
      }
    }
  }
}

// SEDE saidas missing months are OK if file had no lines - not a request
// Check SEDE saidas file coverage
const sedeS = JSON.parse(fs.readFileSync(path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'raw', 'sede-janago-saidas.json'), 'utf8'));
const sedeSMonths = {};
for (const l of sedeS.lines || []) {
  const m = String(l.data || '').match(/\/(\d{2})\/(\d{4})$/);
  if (m) sedeSMonths[`20${m[2].slice(2)}-${m[1]}`] = true; // wrong
}
// fix month key
const sedeSBy = {};
for (const l of sedeS.lines || []) {
  const m = String(l.data || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) continue;
  const key = `${m[3]}-${m[2]}`;
  sedeSBy[key] = (sedeSBy[key] || 0) + 1;
}

pedirOutros.push({
  oQue: 'Apuração 5005 / EFD (PIS, COFINS, ICMS ST detalhado) por unidade/mês',
  motivo: 'Memória hoje só tem ICMS + IPI da planilha grupo; PIS/COFINS/ST zerados',
});
pedirOutros.push({
  oQue: 'Balancete contábil JPG (se quiser aba Balancete)',
  motivo: 'Aba Balancete ainda pendente',
});
pedirOutros.push({
  oQue: 'DRE contábil JPG (se quiser DRE oficial)',
  motivo: 'DRE atual é só estimativa de movimento',
});

// Deduplicate movimento requests
const seen = new Set();
const movUnique = [];
for (const p of pedirMovimento) {
  const k = p.unidade + '|' + p.mes + '|' + p.oQue;
  if (seen.has(k)) continue;
  seen.add(k);
  movUnique.push(p);
}

const out = {
  pedir_agora_movimento: movUnique,
  pedir_ou_autorizar_overlay_impostos: pedirImpostosAlinhar,
  pedir_se_quiser_completar_sistema: pedirOutros,
  sede_saidas_na_planilha_por_mes: sedeSBy,
  nota_sede_saidas: 'SEDE só tem saídas em Jan e Mar na planilha enviada — demais meses 0 é correto, não pedir de novo salvo se houver outro arquivo.',
};

fs.writeFileSync(path.join(ROOT, 'relatorios', 'jpg-sede-df-2026', 'o-que-pedir.json'), JSON.stringify(out, null, 2));

console.log('=== 1) PEDIR MOVIMENTO (planilhas EXITO) ===');
if (!movUnique.length) console.log('(nada)');
for (const p of movUnique) {
  console.log(`- ${p.unidade} | ${p.mes}: ${p.oQue}`);
  console.log(`  motivo: ${p.motivo}`);
}

console.log('\n=== 2) IMPOSTOS JÁ TEMOS NA PLANILHA GRUPO — FALTA APLICAR NO DASH (autorizar) ===');
const byUnit = {};
for (const p of pedirImpostosAlinhar) {
  byUnit[p.unidade] = byUnit[p.unidade] || [];
  byUnit[p.unidade].push(p.mes);
}
for (const [u, ms] of Object.entries(byUnit)) {
  console.log(`- ${u}: meses ${ms.join(', ')}`);
  console.log(`  (arquivo já existe: IMPOSTOS ICMS E IPI GRUPO JPG.xlsx — só falta overlay em MG/PR/SP)`);
}

console.log('\n=== 3) PEDIR SÓ SE QUISER COMPLETAR (não bloqueia o que foi feito) ===');
for (const p of pedirOutros) {
  console.log(`- ${p.oQue}`);
  console.log(`  motivo: ${p.motivo}`);
}

console.log('\n=== SEDE SAÍDAS (já na planilha) ===');
console.log(JSON.stringify(sedeSBy));
console.log(out.nota_sede_saidas);
