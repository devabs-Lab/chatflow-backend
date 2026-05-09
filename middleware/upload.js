const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "chat-app",

    resource_type: "auto",

    public_id: Date.now() + "-" + file.originalname.replace(/\s+/g, "-"),
  }),
});

const upload = multer({ storage });

module.exports = { upload };
