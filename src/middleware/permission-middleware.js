const userService = require("../services/user-service");

function requireDashboard(dashboardId) {
  return (req, res, next) => {
    const user = req.session.currentUser;
    if (!user) return res.redirect("/");
    if (userService.canAccess(user, dashboardId)) return next();
    return res.redirect("/auth/dashboard-selector?error=acesso_negado");
  };
}

function requireAdmin(req, res, next) {
  const user = req.session.currentUser;
  if (!user) return res.redirect("/");
  if (!userService.isAdmin(user)) {
    return res.redirect("/auth/dashboard-selector?error=acesso_negado");
  }
  return next();
}

module.exports = { requireDashboard, requireAdmin };
