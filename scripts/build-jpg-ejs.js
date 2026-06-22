const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const matriz = fs.readFileSync(path.join(root, "src/views/JPG/dashboard-matriz.html"), "utf8");
const body = fs.readFileSync(path.join(root, "src/views/JPG/dashboard_body.html"), "utf8");
const appJs = fs.readFileSync(path.join(root, "src/views/JPG/dashboard_app.js"), "utf8");

const styleMatch = matriz.match(/<style>([\s\S]*?)<\/style>/);
let css = styleMatch[1];
css = css
  .replace(/--accent:#3b82f6/g, "--accent:#22a329")
  .replace(/--accent-hover:#2563eb/g, "--accent-hover:#1a8a20")
  .replace(/--border-accent:rgba\(59,130,246,0\.35\)/g, "--border-accent:rgba(34,163,41,0.35)")
  .replace(/rgba\(59,130,246,0\.15\)/g, "rgba(34,163,41,0.15)")
  .replace(/rgba\(59,130,246,0\.07\)/g, "rgba(34,163,41,0.07)")
  .replace(/rgba\(59,130,246,0\.2\)/g, "rgba(34,163,41,0.2)")
  .replace(/rgba\(59,130,246,0\.25\)/g, "rgba(34,163,41,0.25)")
  .replace(/rgba\(59,130,246,0\.5\)/g, "rgba(34,163,41,0.5)")
  .replace(/rgba\(59,130,246,0\.35\)/g, "rgba(34,163,41,0.35)")
  .replace(/rgba\(59,130,246,0\.4\)/g, "rgba(34,163,41,0.4)")
  .replace(/rgba\(59,130,246,0\.7\)/g, "rgba(34,163,41,0.7)")
  .replace(
    /linear-gradient\(135deg,var\(--accent\),var\(--purple\)\)/g,
    "linear-gradient(135deg,#22a329,#4ade80)"
  );

const extraCss = `
    .btn-back-hub { display:inline-flex; align-items:center; gap:6px; text-decoration:none; }
    .logo-icon { background:linear-gradient(135deg,#22a329,#4ade80) !important; }
`;

let bodyHtml = body
  .replace('href="index.html"', 'href="/auth/jpg"')
  .replace(
    '<div class="header-actions">',
    '<div class="header-actions"><a href="/auth/dashboard-selector" class="btn-export btn-back-hub"><i class="fas fa-arrow-left"></i> Voltar</a>'
  );
bodyHtml = bodyHtml.replace(/<script>[\s\S]*<\/script>/, "");

const themedApp = appJs
  .replace(/const PAL = \['#3b82f6'/, "const PAL = ['#22a329'")
  .replace(/#3b82f6/g, "#22a329");

const ejs = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dashboard <%= filialData.meta.filial_label %> | JPG</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>${css}${extraCss}</style>
</head>
<body>
${bodyHtml}
<script>
const FILIAL_DATA = <%- JSON.stringify(filialData) %>;
${themedApp}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(root, "src/views/jpg-filial.ejs"), ejs);
console.log("Created jpg-filial.ejs");
