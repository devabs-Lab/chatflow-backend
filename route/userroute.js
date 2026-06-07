const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");
const { upload } = require("../storage/Storageconfig");

// usercontroller
const {
  register,
  login,
  check,
  usernameprovider,
  updateUserProfile,
  uploadAvatar,
} = require("../controller/usercontroller");

const { validateRegister, validateLogin } = require("../middleware/validationSchemas");

router.post("/register", validateRegister, register);

// login user

router.post("/login", validateLogin, login);

// username provider

router.get("/username", usernameprovider);

// check user

router.get("/check", authmiddleware, check);

// update user profile

router.put("/update-profile", authmiddleware, updateUserProfile);

router.post("/avatar", authmiddleware, upload.single("avatar"), uploadAvatar);

module.exports = router;
