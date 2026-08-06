'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ejs = require('ejs');

ejs.renderFile(path.join(__dirname, '..', 'src', 'views', 'jpg.ejs'), {}, (err, html) => {
  if (err) { console.error(err); process.exit(1); }
  const must = ['value="SEDE"', 'Matriz Sede', '2026-01', '2026-06', 'nav-compras'];
  let ok = true;
  for (const m of must) {
    const hit = html.includes(m);
    console.log(m, hit);
    if (!hit) ok = false;
  }
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match; let i = 0;
  while ((match = re.exec(html))) {
    const code = match[1].trim();
    if (!code) continue;
    try { new vm.Script(code, { filename: 's' + i }); }
    catch (e) { console.error('syntax', i, e.message); ok = false; }
    i++;
  }
  console.log('scripts', i, 'ok', ok);
  process.exit(ok ? 0 : 1);
});
