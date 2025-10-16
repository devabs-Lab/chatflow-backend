const { StatusCodes } = require("http-status-codes");
const jwt = require("jsonwebtoken");
async function authmiddleware(req, res, next) {
  const authheader = req.headers.authorization;

  if (!authheader || !authheader.startsWith("Bearer")) {
    console.warn("Auth failed: Missing or malformed Authorization header", {
      hasHeader: !!authheader,
      headerPreview: authheader ? authheader.slice(0, 20) + "..." : null,
    });
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ msg: "Authentication Invalid for the case not known" });
  }

  const token = authheader.split(" ")[1];
  //   console.log(authheader);
  //   console.log(token);

  try {
    const { username, userid } = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { username, userid };
    next();
  } catch (error) {
    console.error("JWT verify failed:", error.message);
    return res
      .status(StatusCodes.UNAUTHORIZED)
      .json({ msg: "Authorization Invalid sy" });
  }
}

module.exports = authmiddleware;
