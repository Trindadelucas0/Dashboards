const express = require("express");

const authControl = require("../controllers/auth-control");
const authMiddleware = require("../middleware/auth-middleware");
const { requireDashboard, requireAdmin } = require("../middleware/permission-middleware");

const router = express.Router();
router.get("/", authControl.index);
router.post("/auth/login", authControl.login);
router.get("/auth/logout", authMiddleware, authControl.logout);
router.get("/auth/dashboard-selector", authMiddleware, authControl.dashboardSelector);
router.get("/auth/admin", authMiddleware, requireAdmin, authControl.adminPanel);
router.post("/auth/admin/users", authMiddleware, requireAdmin, authControl.adminCreateUser);
router.post("/auth/admin/users/delete", authMiddleware, requireAdmin, authControl.adminDeleteUser);
router.get("/auth/UNICATINTAS", authMiddleware, requireDashboard("unicatintas"), authControl.UNICATINTAS);
router.get("/auth/loja-maquinas", authMiddleware, requireDashboard("loja-maquinas"), authControl.lojamaquinas);
router.get("/auth/lojamaquinas1trm", authMiddleware, requireDashboard("loja-maquinas"), authControl.lojamaquinas1trm);
router.get("/auth/baifer2trm", authMiddleware, requireDashboard("baifer"), authControl.baifer2trm);
router.get("/auth/baifer1trm", authMiddleware, requireDashboard("baifer"), authControl.baifer1trm);
router.get("/auth/schumacher", authMiddleware, requireDashboard("schumacher"), authControl.schumacher);
router.get("/auth/egaplast", authMiddleware, requireDashboard("egaplast"), authControl.egaplast);
router.get("/auth/du-lanche", authMiddleware, requireDashboard("du-lanche"), authControl.duLanche);
router.get("/auth/jpg", authMiddleware, requireDashboard("jpg"), authControl.jpg);
router.get("/auth/jpg/:filial", authMiddleware, requireDashboard("jpg"), authControl.jpgFilial);
module.exports = router;
