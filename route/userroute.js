const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");

// usercontroller
const {
  register,
  login,
  check,
  usernameprovider,
} = require("../controller/usercontroller");

router.post("/register", register);

// login user

router.post("/login", login);

// username provider

router.get("/username", usernameprovider);

// check user

router.get("/check", authmiddleware, check);

module.exports = router;
