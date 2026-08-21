const { spawn } = require("child_process");
const net = require("net");
const path = require("path");

function portInUse(port, host) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host }, () => {
      sock.end();
      resolve(true);
    });
    sock.setTimeout(400, () => {
      sock.destroy();
      resolve(true);
    });
    sock.once("error", () => resolve(false));
  });
}

async function pickPort() {
  for (const port of [3000, 3001, 3002, 3003, 3004, 3005]) {
    const v4 = await portInUse(port, "127.0.0.1");
    const v6 = await portInUse(port, "::1");
    if (!v4 && !v6) return port;
  }
  throw new Error("Nenhuma porta livre entre 3000–3002");
}

(async () => {
  const port = await pickPort();
  console.log(`Frontend em http://localhost:${port}`);
  const frontend = path.join(__dirname, "..", "frontend");
  const child = spawn(`npx next dev -p ${port}`, {
    cwd: frontend,
    stdio: "inherit",
    shell: true,
    env: process.env,
    windowsHide: true,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
