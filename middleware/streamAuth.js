// middleware/streamAuth.js
const jwt = require("jsonwebtoken");

function verifyStreamToken(req, res, next) {
  const token = req.query.token;
  if (!token) return res.sendStatus(401);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.sendStatus(403);
  }
}

module.exports = verifyStreamToken;
