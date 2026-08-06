const http = require("http");

function req(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const data = body ? new URLSearchParams(body).toString() : null;
    const r = http.request(
      {
        host: "127.0.0.1",
        port: 4243,
        path,
        method,
        headers: {
          ...(data
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(data),
              }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: b }));
      }
    );
    r.on("error", reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const tests = [
    ["unica", { username: "unicatintas", password: "Unica@2026" }, "/auth/UNICATINTAS", "2117167.66", "2440744.56"],
    ["loja", { username: "lojamaquinas", password: "Loja@2026" }, "/auth/loja-maquinas", "461735.82", "731914.74"],
    ["ega", { username: "egaplast", password: "Ega@2026" }, "/auth/egaplast", "441531.17", "1383647.78"],
    ["baifer", { username: "baifer", password: "Baifer@2026" }, "/auth/baifer2trm", "603647.3", "702014.58"],
  ];
  for (const [id, cred, path, compras, vendas] of tests) {
    const login = await req("POST", "/auth/login", cred);
    const set = login.headers["set-cookie"];
    const cookie = Array.isArray(set)
      ? set.map((s) => s.split(";")[0]).join("; ")
      : String(set || "").split(";")[0];
    const page = await req("GET", path, null, cookie);
    const okStatus = page.status === 200;
    const okC = page.body.includes(String(compras));
    const okV = page.body.includes(String(vendas));
    const okJul =
      page.body.includes("Jul") || page.body.includes('"07"') || page.body.includes("2026-07");
    console.log(id, {
      status: page.status,
      cookie: !!cookie,
      compras: okC,
      vendas: okV,
      jul: okJul,
      bodyLen: page.body.length,
    });
    if (!okStatus || !okC || !okV || !okJul) process.exitCode = 1;
  }
  console.log(process.exitCode ? "HTTP AUTH SMOKE FAIL" : "HTTP AUTH SMOKE OK");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
