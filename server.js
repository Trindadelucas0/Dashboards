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
const PORT = 4243;
const server = app.listen(PORT);

server.on("listening", () => {
    console.log(`SERVIDOR INICIADO \nRODANDO EM \n=> http://localhost:${PORT}/ <=`);
});

server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
        console.error(`ERRO: a porta ${PORT} já está em uso.`);
        console.error("Feche o servidor anterior ou execute: taskkill /F /PID <pid>");
    } else {
        console.error("ERRO ao iniciar o servidor:", err.message);
    }
    process.exit(1);
});
