const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const out = path.join(root, "..", "DASH", "lojja", "LOJA-MAQUINAS.html");

let html = execSync("git show HEAD:src/views/loja-maquinas.ejs", {
  cwd: root,
  encoding: "utf8",
});

html = html.replace(
  /<a href="\/auth\/dashboard-selector" class="btn-export btn-back-hub">[\s\S]*?<\/a>/,
  ""
);
html = html.replace(
  /\n    \.btn-back-hub \{ display:inline-flex; align-items:center; gap:6px; text-decoration:none; \}\n/,
  "\n"
);

fs.writeFileSync(out, html, "utf8");
const sample = html.match(/Loja das [^\n<]+/);
console.log("Restored:", sample ? sample[0] : "OK");
