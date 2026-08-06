'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const file = path.join(__dirname, '..', 'src', 'views', 'jpg.ejs');
const html = fs.readFileSync(file, 'utf8');

const mustHave = [
  'id="nav-compras"',
  'id="nav-impostos"',
  'id="nav-memoria"',
  'id="nav-recebimentos"',
  'id="nav-balancete"',
  'id="nav-indicadores"',
  'id="tab-compras"',
  'id="panel-compras"',
  'id="tab-impostos"',
  'id="panel-indicadores"',
  'const TAB_EXTRA_INIT',
  "'compras': renderEntradas",
];
const mustNot = [
  'id="nav-comparativo"',
  'id="tab-comparativo"',
  'function updateNavComparativo',
  'function initComparativo',
  'id="nav-entradas"',
  'id="tab-entradas"',
  'id="panel-entradas"',
];

let ok = true;
for (const m of mustHave) {
  if (!html.includes(m)) { console.error('MISSING', m); ok = false; }
}
for (const m of mustNot) {
  if (html.includes(m)) { console.error('SHOULD NOT', m); ok = false; }
}

const scripts = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let match;
while ((match = re.exec(html))) {
  const code = match[1].trim();
  if (code) scripts.push(code);
}
console.log('inline scripts:', scripts.length);

scripts.forEach((code, i) => {
  try {
    new vm.Script(code, { filename: 'jpg-inline-' + i + '.js' });
  } catch (e) {
    console.error('SYNTAX FAIL script', i, e.message);
    ok = false;
  }
});

if (!ok) process.exit(1);
console.log('syntax+markers OK');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    }).on('error', reject);
  });
}

(async () => {
  try {
    const r = await get('http://127.0.0.1:4243/auth/jpg');
    console.log('HTTP /auth/jpg', r.status, 'len', r.body.length);
    if (r.status !== 200) process.exit(2);
    for (const m of ['nav-compras', 'nav-impostos', 'tab-compras', 'TAB_EXTRA_INIT']) {
      if (!r.body.includes(m)) { console.error('HTTP body missing', m); process.exit(3); }
    }
    if (r.body.includes('nav-comparativo') || r.body.includes('tab-comparativo')) {
      console.error('HTTP body still has comparativo');
      process.exit(4);
    }
    console.log('smoke HTTP OK');
  } catch (e) {
    console.warn('server not reachable, skipping HTTP smoke:', e.message);
  }
})();
