const path = require("path");
const fs = require("fs");
const ffmpeg = require("./ffmpeg");

const THUMB_DIR = path.join(__dirname, "..", "uploads", "thumbs");

if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true });
}

function generateVideoThumbnail(videoPath, filename) {
  return new Promise((resolve, reject) => {
    const thumbName = filename.replace(/\.[^/.]+$/, ".jpg");
    const thumbPath = path.join(THUMB_DIR, thumbName);

    ffmpeg(videoPath)
      .on("end", () => resolve(`/uploads/thumbs/${thumbName}`))
      .on("error", reject)
      .screenshots({
        count: 1,
        timemarks: ["0.5"], // safer than 1s
        filename: thumbName,
        folder: THUMB_DIR,
        // size: "320x?",
      });
  });
}

module.exports = { generateVideoThumbnail };
