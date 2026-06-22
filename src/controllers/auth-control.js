const jpgData = require("../data/jpg-filiais");

let users = [
  { username: "lucas", password: "1234" },
  { username: "Paulo", password: "2026" }
];
module.exports={
    index:(req,res)=>{
        res.render("index");
    },
//register
  register: (req, res) => {
    const { username, password } = req.body;
    const userexist = users.find((user) => user.username === username);
    if (userexist) {
      console.log("USUARIO JA EXISTE");
      return res.status(400).redirect("/");
    }
    const newUser = { username, password };
    console.table(newUser);
    users.push(newUser);
    res.redirect("/");
  },
  login: (req, res) => {
    const { username, password } = req.body;
    const user = users.find((user) => user.username === username);
    if (!user) {
      console.log("usuario não EXISTE");
      return res.redirect("/");
    }
    if (password !== user.password) {
      console.log("senha inexistente");
      return res.redirect("/");
    }
    //session
    req.session.authenticated = true;
    req.session.currentUser = user;

    console.log(`BEM VINDO ${username}`);
  res.redirect("/auth/dashboard-selector");
  },
  logout: (req, res) => {
    req.session.authenticated = false;
    req.session.currentUser = null;
    console.log("saindo");
    res.redirect("/");
  },
  dashboardSelector: (req, res) => {
    const currentUser = req.session.currentUser ? req.session.currentUser.username : 'Usuário';
    res.render("dashboard-selector", { currentUser });
  },
  UNICATINTAS:(req,res)=>{
    res.render("UNICATINTAS")
  },
  lojamaquinas:(req,res)=>{
    res.render("loja-maquinas")
  },
  lojamaquinas1trm:(req,res)=>{
    res.render("lojamaquinas1trm")
  },
  baifer2trm:(req,res)=>{
    res.render("baifer2trm")
  },
  baifer1trm:(req,res)=>{
    res.render("baifer1trm")
  },
  jpg:(req,res)=>{
    res.render("jpg", { hub: jpgData.hub });
  },
  jpgFilial:(req,res)=>{
    const key = req.params.filial;
    const filialData = jpgData.filiais[key];
    if (!filialData) return res.redirect("/auth/jpg");
    res.render("jpg-filial", { filialData, filialKey: key });
  }
};