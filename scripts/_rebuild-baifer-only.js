const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = "c:/Users/trind/Desktop/dashboards";
const htmlPath = path.join(root, "DASH/BAIFER DASHBOARD/baifer.html");
const viewsDir = path.join(root, "Dashboards/src/views");
const BACK =
  '<a href="/auth/dashboard-selector" class="btn-export btn-back-hub"><i class="fas fa-arrow-left"></i> Voltar</a>';
const EXTRA = `
    .btn-back-hub { display:inline-flex; align-items:center; gap:6px; text-decoration:none; }
`;

let html = fs.readFileSync(htmlPath, "utf8");
html = html.replace(
  /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
  (match, src) => {
    if (/^https?:/i.test(src)) return match;
    const filePath = path.join(path.dirname(htmlPath), src.split("?")[0].split("#")[0]);
    if (!fs.existsSync(filePath)) throw new Error("missing " + filePath);
    return "<script>\n" + fs.readFileSync(filePath, "utf8") + "\n</script>";
  }
);
if (!html.includes("btn-back-hub")) {
  html = html.replace(
    '<div class="header-actions">',
    '<div class="header-actions">' + BACK
  );
}
if (!html.includes(".btn-back-hub {") && html.includes("</style>")) {
  html = html.replace("</style>", EXTRA + "\n  </style>");
}

const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
let i = 0;
while ((m = re.exec(html)) !== null) {
  const t = m[1].trim();
  if (!t) continue;
  try {
    new vm.Script(t);
  } catch (err) {
    throw new Error("script #" + ++i + ": " + err.message);
  }
  i++;
}

for (const out of ["baifer1trm.ejs", "baifer2trm.ejs"]) {
  fs.writeFileSync(path.join(viewsDir, out), html);
  console.log("wrote", out);
}
console.log("baifer rebuild OK");
