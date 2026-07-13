const fs = require("fs");
const vm = require("vm");
const html = fs.readFileSync("c:/Users/trind/Desktop/dashboards/Dashboards/src/views/loja-maquinas.ejs", "utf8");
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0;
while ((m = re.exec(html))) {
  const t = m[1].trim();
  if (!t) continue;
  i++;
  try {
    new vm.Script(t, { filename: "loja-s" + i });
    console.log("OK script", i, "len", t.length);
  } catch (e) {
    console.log("FAIL script", i, e.message);
  }
}
// Is openSupplierModal nested?
const idx = html.indexOf("function openSupplierModal");
const before = html.slice(Math.max(0, idx - 200), idx);
console.log("before openSupplierModal context:", JSON.stringify(before.slice(-120)));
console.log("strict?", /['\"]use strict['\"]/.test(html));
