const fs = require("fs");
const http = require("http");
const vm = require("vm");
const path = require("path");

function findObj(html, marker) {
  const i = html.indexOf(marker);
  const start = html.indexOf("{", i);
  let depth = 0, inStr = false, quote = "", esc = false;
  for (let j = start; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return JSON.parse(html.slice(start, j + 1));
    }
  }
}

const ejs = path.join(__dirname, "..", "src", "views", "jpg.ejs");
const html = fs.readFileSync(ejs, "utf8");
const J = findObj(html, "const JPG_DATA =");
const jul = J.fiscalPorMes.porMes["2026-07"];
const mai = J.fiscalPorMes.porMes["2026-05"];

const checks = [];
function ok(c, m) { checks.push([!!c, m]); console.log(c ? "OK" : "FAIL", m); }

ok(J.fiscalPorMes.meses.includes("2026-07"), "meses tem 2026-07");
ok(J.meta.competenciaDefault === "2026-07", "default Jul");
ok(jul.filiais.PR.kpis.entradas === 8729.12, "PR entradas 8729.12");
ok(jul.filiais.PR.kpis.saidas === 71589.79, "PR saidas 71589.79");
ok(mai.filiais.PR.kpis.entradas === 16246.14, "regressao Mai PR");
ok(/ausente/i.test(jul.filiais.MG.meta.alerta), "MG stub alerta");

const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, i = 0, synFail = 0;
while ((m = re.exec(html))) {
  const t = m[1].trim();
  if (!t) continue;
  i++;
  try { new vm.Script(t, { filename: "jpg#" + i }); }
  catch (e) { synFail++; console.error(e.message); }
}
ok(synFail === 0, "syntax scripts=" + i);

function req(method, p, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? new URLSearchParams(body).toString() : null;
    const r = http.request({
      host: "127.0.0.1", port: 4243, path: p, method,
      headers: {
        ...(data ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(data) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
    });
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  try {
    const login = await req("POST", "/auth/login", { username: "jpg", password: "Jpg@2026" });
    const set = login.headers["set-cookie"];
    const cookie = Array.isArray(set) ? set.map((s) => s.split(";")[0]).join("; ") : String(set || "").split(";")[0];
    const page = await req("GET", "/auth/jpg", null, cookie);
    ok(page.status === 200, "http /auth/jpg " + page.status);
    ok(page.body.includes("8729.12"), "html tem compras PR");
    ok(page.body.includes("71589.79"), "html tem vendas PR");
    ok(page.body.includes("2026-07") || page.body.includes("Jul/2026"), "html tem Jul");
  } catch (e) {
    ok(false, "server: " + e.message);
  }
  if (checks.some((c) => !c[0])) {
    console.error("SMOKE JPG FAIL");
    process.exit(1);
  }
  console.log("SMOKE JPG OK");
})();
