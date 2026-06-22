const fs = require("node:fs");
const path = require("node:path");

const admins = require("../config/admins");
const dashboards = require("../config/dashboards");

const USERS_FILE = path.join(__dirname, "..", "data", "users.json");

function readAppUsers() {
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeAppUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + "\n", "utf8");
}

function findAdmin(username) {
  return admins.find((u) => u.username === username) || null;
}

function findAppUser(username) {
  return readAppUsers().find((u) => u.username === username) || null;
}

function authenticate(username, password) {
  const admin = findAdmin(username);
  if (admin && admin.password === password) {
    return { username: admin.username, role: "admin", dashboards: null };
  }

  const appUser = findAppUser(username);
  if (appUser && appUser.password === password) {
    return {
      username: appUser.username,
      role: "user",
      dashboards: Array.isArray(appUser.dashboards) ? appUser.dashboards : [],
    };
  }

  return null;
}

function isAdmin(user) {
  return user && user.role === "admin";
}

function getDashboardIdsForUser(user) {
  if (!user) return [];
  if (isAdmin(user)) return dashboards.map((d) => d.id);
  return user.dashboards || [];
}

function getDashboardIdByPath(pathname) {
  for (const dash of dashboards) {
    for (const route of dash.routes) {
      if (route.includes(":filial")) {
        const prefix = route.replace("/:filial", "/");
        if (pathname === route.replace("/:filial", "") || pathname.startsWith(prefix)) {
          return dash.id;
        }
      } else if (pathname === route) {
        return dash.id;
      }
    }
  }
  return null;
}

function canAccess(user, dashboardId) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return getDashboardIdsForUser(user).includes(dashboardId);
}

function listAppUsers() {
  return readAppUsers();
}

function getAllDashboards() {
  return dashboards;
}

function createAppUser(username, password, dashboardIds) {
  const name = String(username || "").trim();
  const pass = String(password || "").trim();

  if (!name || !pass) {
    return { ok: false, error: "Usuário e senha são obrigatórios." };
  }

  if (findAdmin(name) || findAppUser(name)) {
    return { ok: false, error: "Usuário já existe." };
  }

  const validIds = dashboards.map((d) => d.id);
  const selected = (dashboardIds || []).filter((id) => validIds.includes(id));

  if (selected.length === 0) {
    return { ok: false, error: "Selecione ao menos um dashboard." };
  }

  const users = readAppUsers();
  users.push({ username: name, password: pass, dashboards: selected });
  writeAppUsers(users);

  return { ok: true };
}

function deleteAppUser(username) {
  const users = readAppUsers().filter((u) => u.username !== username);
  writeAppUsers(users);
  return { ok: true };
}

module.exports = {
  authenticate,
  isAdmin,
  getDashboardIdsForUser,
  getDashboardIdByPath,
  canAccess,
  listAppUsers,
  getAllDashboards,
  createAppUser,
  deleteAppUser,
};
