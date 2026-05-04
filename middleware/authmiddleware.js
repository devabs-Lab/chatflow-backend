const { StatusCodes } = require("http-status-codes");
const jwt = require("jsonwebtoken");

async function authmiddleware(req, res, next) {
  let token;

  // 1. Check header
  const authheader = req.headers.authorization;
  if (authheader && authheader.startsWith("Bearer")) {
    token = authheader.split(" ")[1];
  }

  // 2. Fallback to query string (for video/audio streaming)
  if (!token && req.query?.token) {
    token = req.query.token;
  }

  if (!token) {
    console.warn("Auth failed: Missing token", {
      hasHeader: !!authheader,
      hasQueryToken: !!req.query?.token,
    });
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ msg: "Authentication Invalid" });
  }

  try {
    const { username, userid } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { username, userid };
    next();
  } catch (error) {
    console.error("JWT verify failed:", error.message);
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ msg: "Authorization Invalid" });
  }
}

module.exports = authmiddleware;
