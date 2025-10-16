// controllers/fileController.js
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const pool = require("../db/dbconfig");

async function streamOrDownloadFile(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user?.userid; // auth middleware required

    // 1) Fetch DB row
    const { rows } = await pool.query("SELECT * FROM messages WHERE id = $1", [
      messageId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: "Message not found" });
    const msg = rows[0];

    // 2) Authorization: only sender or receiver
    if (msg.sender_id !== userId && msg.receiver_id !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // 3) Resolve file path
    const uploadsDir = path.join(__dirname, "..", "uploads");
    const filename = path.basename(msg.fileurl); // sanitize
    const fullPath = path.join(uploadsDir, filename);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: "File missing on server" });
    }

    // 4) File stats
    const stat = fs.statSync(fullPath);
    const fileSize = stat.size;
    const mimeType = mime.lookup(fullPath) || "application/octet-stream";

    // 5) Streaming logic (video/audio) vs normal file
    const range = req.headers.range;

    if (
      range &&
      (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))
    ) {
      // --- STREAMING ---
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      if (start >= fileSize) {
        return res.status(416).send("Requested range not satisfiable");
      }
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(fullPath, { start, end });

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": mimeType,
      });

      stream.pipe(res);
    } else {
      // --- FULL DOWNLOAD ---
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${
          msg.filename || filename
        }"`,
      });

      fs.createReadStream(fullPath).pipe(res);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { streamOrDownloadFile };
