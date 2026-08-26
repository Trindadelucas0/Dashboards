const path = require("path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "dashboards-nova-api",
      cwd: path.join(root, "backend"),
      script: path.join(root, "backend", ".venv", "bin", "python"),
      args: "-m uvicorn app.main:app --host 127.0.0.1 --port 8001",
      interpreter: "none",
      env: {
        PYTHONPATH: path.join(root, "backend"),
      },
    },
    {
      name: "dashboards-nova-web",
      cwd: path.join(root, "frontend"),
      script: path.join(root, "frontend", "node_modules", "next", "dist", "bin", "next"),
      args: "start -H 127.0.0.1 -p 9527",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "9527",
      },
    },
  ],
};
