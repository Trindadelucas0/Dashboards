const authMiddleware = (req, res, next) => {
  if (req.session.authenticated) {
    console.log("seguindo");
    next();
  } else {
    console.log("BLOQUEADO");
    res.redirect("/");
  }
};
module.exports = authMiddleware;
