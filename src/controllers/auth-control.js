const jpgData = require("../data/jpg-filiais");
const userService = require("../services/user-service");

module.exports = {
  index: (req, res) => {
    res.render("index");
  },
  login: (req, res) => {
    const { username, password } = req.body;
    const user = userService.authenticate(username, password);
    if (!user) {
      console.log("login falhou:", username);
      return res.redirect("/");
    }
    req.session.authenticated = true;
    req.session.currentUser = user;
    console.log(`BEM VINDO ${username} (${user.role})`);
    res.redirect("/auth/dashboard-selector");
  },
  logout: (req, res) => {
    req.session.authenticated = false;
    req.session.currentUser = null;
    console.log("saindo");
    res.redirect("/");
  },
  dashboardSelector: (req, res) => {
    const user = req.session.currentUser;
    const currentUser = user ? user.username : "Usuário";
    const isAdmin = userService.isAdmin(user);
    const allowedDashboards = userService.getDashboardIdsForUser(user);
    res.render("dashboard-selector", {
      currentUser,
      isAdmin,
      allowedDashboards,
      error: req.query.error || null,
    });
  },
  adminPanel: (req, res) => {
    res.render("admin", {
      currentUser: req.session.currentUser.username,
      dashboards: userService.getAllDashboards(),
      appUsers: userService.listAppUsers(),
      message: req.query.message || null,
      error: req.query.error || null,
    });
  },
  adminCreateUser: (req, res) => {
    const { username, password } = req.body;
    const dashboards = [].concat(req.body.dashboards || []).filter(Boolean);
    const result = userService.createAppUser(username, password, dashboards);
    if (!result.ok) {
      return res.redirect("/auth/admin?error=" + encodeURIComponent(result.error));
    }
    res.redirect("/auth/admin?message=" + encodeURIComponent("Usuário criado com sucesso."));
  },
  adminDeleteUser: (req, res) => {
    const { username } = req.body;
    if (username) userService.deleteAppUser(username);
    res.redirect("/auth/admin?message=" + encodeURIComponent("Usuário removido."));
  },
  UNICATINTAS: (req, res) => {
    res.render("UNICATINTAS");
  },
  lojamaquinas: (req, res) => {
    res.render("loja-maquinas");
  },
  lojamaquinas1trm: (req, res) => {
    res.render("lojamaquinas1trm");
  },
  baifer2trm: (req, res) => {
    res.render("baifer2trm");
  },
  baifer1trm: (req, res) => {
    res.render("baifer1trm");
  },
  jpg: (req, res) => {
    res.render("jpg", { hub: jpgData.hub });
  },
  jpgFilial: (req, res) => {
    const key = req.params.filial;
    const filialData = jpgData.filiais[key];
    if (!filialData) return res.redirect("/auth/jpg");
    res.render("jpg-filial", { filialData, filialKey: key });
  },
};
