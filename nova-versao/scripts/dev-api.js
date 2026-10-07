const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const backend = path.join(__dirname, "..", "backend");
const pyWin = path.join(backend, ".venv", "Scripts", "python.exe");
const pyUnix = path.join(backend, ".venv", "bin", "python");
const py = fs.existsSync(pyWin) ? pyWin : pyUnix;

if (!fs.existsSync(py)) {
  console.error("Falta o Python em backend/.venv. Crie com:");
  console.error("  cd backend");
  console.error("  py -3.11 -m venv .venv");
  console.error("  .venv\\Scripts\\pip install -r requirements.txt");
  process.exit(1);
}

function baseInterpreter(backendDir) {
  const cfgPath = path.join(backendDir, ".venv", "pyvenv.cfg");
  if (!fs.existsSync(cfgPath)) return null;
  let executable = null;
  let home = null;
  for (const line of fs.readFileSync(cfgPath, "utf8").split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key === "executable") executable = value;
    if (key === "home") home = value;
  }
  if (executable && fs.existsSync(executable)) return executable;
  if (!home) return null;
  const candidate = path.join(home, "python.exe");
  return fs.existsSync(candidate) ? candidate : null;
}

// No Windows o stub .venv/Scripts/python.exe é bloqueado pelo Controle de
// Aplicativo (spawn UNKNOWN / -4094). O interpretador de pyvenv.cfg sobe, e
// __PYVENV_LAUNCHER__ faz o site usar o prefixo do venv.
const env = { ...process.env };
let command = py;
if (process.platform === "win32") {
  const base = baseInterpreter(backend);
  if (base) {
    command = base;
    env.__PYVENV_LAUNCHER__ = py;
  }
}

console.log("API em http://127.0.0.1:8001");
const child = spawn(
  command,
  ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8001"],
  { cwd: backend, stdio: "inherit", env, windowsHide: true },
);
child.on("error", (err) => {
  console.error("Não foi possível iniciar o Python da API:", err.message);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
