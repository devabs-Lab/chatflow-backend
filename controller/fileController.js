// // controllers/fileController.js
// const fs = require("fs");
// const path = require("path");
// const mime = require("mime-types");
// const pool = require("../db/dbconfig");

// async function streamOrDownloadFile(req, res) {
//   try {
//     const { messageId } = req.params;

//     console.log("DOWNLOAD ID:", messageId);
//     const userId = req.user?.userid; // auth middleware required
//     console.log("File request for message ID:", messageId, "by user:", userId);
//     // 1) Fetch DB row
//     if (messageId.includes("temp-")) {
//       return res.status(400).json({ error: "Invalid message ID" });
//     }
//     const { rows } = await pool.query("SELECT * FROM messages WHERE id = $1", [
//       messageId,
//     ]);

//     if (!rows[0]) return res.status(404).json({ error: "Message not found" });
//     const msg = rows[0];

//     // 2) Authorization: only sender or receiver

//     if (msg.sender_id !== userId && msg.receiver_id !== userId) {
//       return res.status(403).json({ error: "Forbidden" });
//     }

//     // 3) Resolve file path
//     // const uploadsDir = path.join(__dirname, "..", "uploads");
//     // const filename = path.basename(msg.fileurl); // sanitize
//     // const fullPath = path.join(uploadsDir, filename);

//     return res.json({ url: msg.fileurl });

//     // console.log("Resolved file path:", fullPath, filename, uploadsDir);
//     // ``;

//     if (!fs.existsSync(fullPath)) {
//       return res.status(404).json({ error: "File missing on server" });
//     }

//     // 4) File stats
//     const stat = fs.statSync(fullPath);
//     const fileSize = stat.size;
//     let mimeType = mime.lookup(fullPath) || "application/octet-stream";

//     // FIX broken mp4 mime

//     console.log(mimeType);

//     if (mimeType === "application/mp4") mimeType = "video/mp4";

//     const isMedia =
//       mimeType.startsWith("video/") || mimeType.startsWith("audio/");

//     // 5) Streaming logic (video/audio) vs normal file
//     const range = req.headers.range;

//     // console.log(range, isMedia);

//     if (range && isMedia) {
//       // --- STREAMING ---

//       console.log("Streaming with range:", range, "and mime type:", isMedia);
//       const parts = range.replace(/bytes=/, "").split("-");
//       const start = parseInt(parts[0], 10);
//       const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
//       if (start >= fileSize) {
//         return res.status(416).send("Requested range not satisfiable");
//       }

//       const chunkSize = end - start + 1;

//       res.writeHead(206, {
//         "Content-Range": `bytes ${start}-${end}/${fileSize}`,
//         "Accept-Ranges": "bytes",
//         "Content-Length": chunkSize,
//         "Content-Type": mimeType,
//       });

//       fs.createReadStream(fullPath, { start, end }).pipe(res);
//       return;
//     } else {
//       // --- FULL DOWNLOAD ---

//       console.log(
//         "Full download for file:",
//         filename,
//         "with mime type:",
//         mimeType,
//       );
//       res.writeHead(200, {
//         "Content-Length": fileSize,
//         "Content-Type": mimeType,
//         "Content-Disposition": `attachment; filename="${
//           msg.filename || filename
//         }"`,
//       });

//       fs.createReadStream(fullPath).pipe(res);
//     }
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// }

// module.exports = { streamOrDownloadFile };

const axios = require("axios");

async function streamOrDownloadFile(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user.userid;

    const { rows } = await pool.query("SELECT * FROM messages WHERE id = $1", [
      messageId,
    ]);

    const msg = rows[0];

    if (!msg) return res.status(404).json({ error: "Not found" });

    if (msg.sender_id !== userId && msg.receiver_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const range = req.headers.range;

    const headers = {};

    if (range) {
      headers.Range = range;
    }

    const response = await axios.get(msg.fileurl, {
      responseType: "stream",
      headers,
    });

    res.status(range ? 206 : 200);

    res.setHeader("Content-Type", response.headers["content-type"]);
    if (response.headers["content-length"]) {
      res.setHeader("Content-Length", response.headers["content-length"]);
    }

    if (response.headers["accept-ranges"]) {
      res.setHeader("Accept-Ranges", "bytes");
    }

    response.data.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "File streaming failed" });
  }
}
