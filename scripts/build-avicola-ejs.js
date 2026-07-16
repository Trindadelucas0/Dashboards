const path = require("path");
const fs = require("fs");

const dashRoot = path.join(__dirname, "..", "..", "DASH");
const viewsDir = path.join(__dirname, "..", "src", "views");
const htmlPath = path.join(dashRoot, "avicola", "avicola.html");

const BACK_BUTTON =
  '<a href="/auth/dashboard-selector" class="btn-export btn-back-hub"><i class="fas fa-arrow-left"></i> Voltar</a>';
const EXTRA_CSS =
  ".btn-back-hub { display:inline-flex; align-items:center; gap:6px; text-decoration:none; }";

function isRemoteSrc(src) {
  return /^https?:\/\//i.test(src);
}

function inlineLocalScripts(html, htmlFile) {
  const htmlDir = path.dirname(htmlFile);
  return html.replace(
    /<script\s+[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
    (match, src) => {
      if (isRemoteSrc(src)) return match;
      const filePath = path.join(htmlDir, src.split("?")[0]);
      if (!fs.existsSync(filePath)) {
        throw new Error("Script nao encontrado: " + filePath);
      }
      return "<script>\n" + fs.readFileSync(filePath, "utf8") + "\n</script>";
    }
  );
}

let html = fs.readFileSync(htmlPath, "utf8");
html = inlineLocalScripts(html, htmlPath);
if (!html.includes("btn-back-hub")) {
  html = html.replace(
    '<div class="header-actions">',
    '<div class="header-actions">' + BACK_BUTTON
  );
}
if (!html.includes(".btn-back-hub")) {
  html = html.replace("</style>", EXTRA_CSS + "\n  </style>");
}

const out = path.join(viewsDir, "avicola.ejs");
fs.writeFileSync(out, html, "utf8");
console.log("Wrote", out, Math.round(fs.statSync(out).size / 1024) + " KB");
console.log("optgroup:", html.includes("1º Trimestre — meses"));
console.log("dim css:", html.includes("button.dim"));
console.log("Q1_MESES:", html.includes("Q1_MESES"));
console.log("activeTrimContext:", html.includes("activeTrimContext"));
