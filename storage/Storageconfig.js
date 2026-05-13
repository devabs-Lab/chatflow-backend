// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// // storage config
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     const uploadPath = path.join(__dirname, "..", "uploads");
//     if (!fs.existsSync(uploadPath)) {
//       fs.mkdirSync(uploadPath);
//     }
//     cb(null, uploadPath);
//   },
//   filename: (req, file, cb) => {
//     // unique filename
//     const uniqueName = Date.now() + "-" + file.originalname;
//     cb(null, uniqueName);
//   },
// });

// // middleware
// const upload = multer({ storage });
// module.exports = { upload };

// const multer = require("multer");
// const { CloudinaryStorage } = require("multer-storage-cloudinary");

// const cloudinary = require("../config/cloudinary");

// const storage = new CloudinaryStorage({
//   cloudinary,
//   params: async (req, file) => ({
//     folder: "chat-app",

//     resource_type: "auto",

//     public_id: Date.now() + "-" + file.originalname.replace(/\s+/g, "-"),
//   }),
// });

// const upload = multer({ storage });

// module.exports = { upload };

const multer = require("multer");
const supabase = require("../config/supabase");

// store file in memory first
const storage = multer.memoryStorage();
const upload = multer({ storage });

module.exports = { upload, supabase };
