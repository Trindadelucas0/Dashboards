const express = require("express");
const app = express();
const path = require("node:path");
const session = require("express-session");
const router = require("./src/routes/route");
app.set("view engine", "ejs");
app.set("views", path.join(__dirname,"src", "views"));
app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: "secreto",
        resave: false,
        saveUninitialized: true, //armazena enquanto tiver rodando
        cookie: { secure: false },
    })
);

app.use(router);
const PORT = 5454;
app.listen(PORT,()=>{
     console.log(`SERVIDOR INICIADO \nRODANDO EM \n=> http://localhost:${PORT}/ <=`)
}) 
