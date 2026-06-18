const express = require("express");

const authControl = require("../controllers/auth-control");
const authMiddleware = require("../middleware/auth-middleware");
const router = express.Router();
router.get("/", authControl.index);
router.post("/auth/register", authControl.register);
router.post("/auth/login", authControl.login);
router.get("/auth/logout", authMiddleware, authControl.logout);
router.get("/auth/dashboard-selector", authMiddleware, authControl.dashboardSelector);
router.get("/auth/UNICATINTAS",authMiddleware,authControl.UNICATINTAS)
router.get("/auth/loja-maquinas",authMiddleware,authControl.lojamaquinas)
router.get("/auth/baifer2trm",authMiddleware,authControl.baifer2trm)
module.exports=router   