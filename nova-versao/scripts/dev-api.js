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

console.log("API em http://127.0.0.1:8001");
const child = spawn(
  py,
  ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8001"],
  { cwd: backend, stdio: "inherit", env: process.env, windowsHide: true },
);
child.on("exit", (code) => process.exit(code ?? 0));
