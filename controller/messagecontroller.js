const pool = require("../db/dbconfig");
const { v4: uuidv4 } = require("uuid");
const { getIO, onlineUsers } = require("../socket/socketState");
const {
  addSignedAvatarUrls,
  createSignedStorageUrl,
} = require("../utils/storageUrls");
// const { generateVideoThumbnail } = require("../utils/videoThumb");
// Send a message to a group

const sendGroupMessage = async (req, res) => {
  const { group_id } = req.params;
  const { content, message_type = "text" } = req.body;
  const sender_id = req.user.userid;
  const client = await pool.connect();
  try {
    // Check if user is a member of the group
    const member = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, sender_id],
    );

    if (member.rows.length === 0) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // Send the message
    const newMessage = await client.query(
      `INSERT INTO messages (sender_id, group_id, content, message_type) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sender_id, group_id, content, message_type],
    );

    // Get sender info for the response
    const sender = await client.query(
      "SELECT username FROM users WHERE userid = $1",
      [sender_id],
    );

    const messageWithSender = {
      ...newMessage.rows[0],
      sender_username: sender.rows[0].username,
    };

    res.status(201).json({
      message: "Message sent successfully",
      data: messageWithSender,
    });
  } catch (error) {
    console.error("Error sending group message:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Send a private message
const sendPrivateMessage = async (req, res) => {
  const { receiver_id } = req.params;
  const { content, message_type = "text", delivered_at } = req.body;
  const sender_id = req.user.userid;
  const client = await pool.connect();

  let deliveredAtDate = new Date(delivered_at).getTime();

  // If more than 5 minutes difference from now, override with now
  if (Math.abs(Date.now() - deliveredAtDate) > 5 * 60 * 1000) {
    deliveredAtDate = Date.now();
  }

  // Always store as ISO string
  const finalDeliveredAt = new Date(deliveredAtDate).toISOString();

  try {
    // Check if receiver exists
    const receiver = await client.query(
      "SELECT 1 FROM users WHERE userid = $1",
      [receiver_id],
    );

    if (receiver.rows.length === 0) {
      return res.status(404).json({ error: "Receiver not found" });
    }

    // Prevent sending message to self
    if (sender_id === receiver_id) {
      return res.status(400).json({ error: "Cannot send message to yourself" });
    }

    // Send the message
    const newMessage = await client.query(
      `INSERT INTO messages (sender_id, receiver_id, content, message_type, delivered_at) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sender_id, receiver_id, content, message_type, finalDeliveredAt],
    );

    // Get sender info for the responserrs
    const sender = await client.query(
      "SELECT username FROM users WHERE userid = $1",
      [sender_id],
    );

    // console.log(newMessage.rows[0]);

    const messageWithSender = {
      ...newMessage.rows[0],
      sender_username: sender.rows[0].username,
    };

    const receiverSockets = onlineUsers.get(receiver_id) || [];

    receiverSockets.forEach((sId) =>
      getIO().to(sId).emit("receive-private-message", messageWithSender),
    );

    res.status(201).json({
      message: "Message sent successfully",
      data: messageWithSender,
    });
  } catch (error) {
    console.error("Error sending private message:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

const uploadCache = new Map();

const supabase = require("../config/supabase");

const sendPrivatefile = async (req, res) => {
  const client = await pool.connect();

  // multer gives us file + text fields
  const file = req.file; // single file
  const {
    sender_id,
    receiver_id,
    message_type,
    delivered_at,
    tempId,
    width,
    height,
    aspect_ratio,
    duration,
  } = req.body;

  console.log("UPLOAD FILE:", file);

  console.log("FILE OBJECT:", file);

  if (!file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  if (uploadCache.has(tempId)) {
    console.log("Duplicate prevented:", tempId);

    return res.json(uploadCache.get(tempId));
  }
  // ===============================
  // 1. Upload to Supabase Storage
  // ===============================
  const fileName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
  const filePath = fileName;

  const { data, error } = await supabase.storage
    .from("chat-files") // bucket name
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (error) {
    console.error("Supabase upload error:", error);
    return res.status(500).json({ error: "Upload failed" });
  }

  // ===============================
  // 2. Save ONLY PATH in DB
  // ===============================
  const fileurl = data.path; // IMPORTANT: store path, NOT full URL
  console.log("Supabase file path:", fileurl);
  let thumbUrl = null;

  console.log("FILEURL:", fileurl);

  if (!fileurl) return;

  try {
    // for cloudinary we don't need this thumbnail

    if (message_type === "video") {
      thumbUrl = fileurl.replace("/upload/", "/upload/so_1/");
    }

    const result = await client.query(
      `INSERT INTO messages
       (sender_id, receiver_id, message_type, delivered_at, filename, filesize, fileurl, thumbUrl, width,
        height, aspect_ratio, duration, is_read)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
       RETURNING *`,
      [
        sender_id,
        receiver_id,
        message_type,
        delivered_at,
        file.originalname,
        file.size,
        fileurl,
        thumbUrl,
        width,
        height,
        aspect_ratio,
        duration,
      ],
    );
    // console.log(result.rows[0]);
    // return saved message
    const savedMessage = result.rows[0];

    // SAVE IN CACHE
    uploadCache.set(tempId, savedMessage);

    const receiverSockets = onlineUsers.get(receiver_id) || [];

    receiverSockets.forEach((sId) =>
      getIO().to(sId).emit("receive-private-message", savedMessage),
    );

    // Optional cleanup after 1 hour
    // setTimeout(
    //   () => {
    //     uploadCache.delete(tempId);
    //   },
    //   1000 * 60 * 60,
    // );

    res.json(savedMessage);
  } catch (err) {
    console.error("File upload error:", err);
    res.status(500).json({ error: "File upload failed" });
  }
};

// Send a group file
// const sendGroupFile = async (req, res) => {
//   const client = await pool.connect();

//   // multer gives us file + text fields
//   const file = req.file; // single file
//   const {
//     sender_id,
//     group_id,
//     message_type,
//     delivered_at,
//     tempId,
//     width,
//     height,
//     aspect_ratio,
//     duration,
//   } = req.body;

//   if (!file) {
//     return res.status(400).json({ error: "No file uploaded" });
//   }

//   if (uploadCache.has(tempId)) {
//     console.log("Duplicate prevented:", tempId);
//     return res.json(uploadCache.get(tempId));
//   }

//   // Check if user is a member of the group
//   const member = await client.query(
//     "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
//     [group_id, sender_id],
//   );

//   if (member.rows.length === 0) {
//     return res.status(403).json({ error: "Not a member of this group" });
//   }

//   // i create file URL (for frontend to access later)
//   const fileurl = `/uploads/${file.filename}`;
//   let thumbUrl = null;

//   if (!fileurl) return;

//   try {
//     if (message_type === "video") {
//       thumbUrl = await generateVideoThumbnail(file.path, file.filename);
//     }

//     // save to DB
//     const result = await client.query(
//       `INSERT INTO messages
//        (sender_id, group_id, message_type, delivered_at, filename, filesize, fileurl, thumbUrl, width,
//         height, aspect_ratio, duration, is_read)
//        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false)
//        RETURNING *`,
//       [
//         sender_id,
//         group_id,
//         message_type,
//         delivered_at,
//         file.originalname,
//         file.size,
//         fileurl,
//         thumbUrl,
//         width,
//         height,
//         aspect_ratio,
//         duration,
//       ],
//     );

//     const savedMessage = result.rows[0];

//     // Get sender info for the response
//     const sender = await client.query(
//       "SELECT username FROM users WHERE userid = $1",
//       [sender_id],
//     );

//     const messageWithSender = {
//       ...savedMessage,
//       sender_username: sender.rows[0].username,
//     };

//     // SAVE IN CACHE
//     uploadCache.set(tempId, messageWithSender);

//     // Emit to group room
//     io.to(`group-${group_id}`).emit("receive-group-message", messageWithSender);

//     res.json(messageWithSender);
//   } catch (err) {
//     console.error("Group file upload error:", err);
//     res.status(500).json({ error: "File upload failed" });
//   } finally {
//     client.release();
//   }
// };

// Get all users (for starting new chats)
const getAllUsers = async (req, res) => {
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const users = await client.query(
      `SELECT userid, username, avatar_url, bio, phone, department, status, last_seen
       FROM users
       WHERE userid != $1
       ORDER BY username ASC`,
      [user_id],
    );

    res.json(await addSignedAvatarUrls(users.rows));
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// GET update messages since last timestamp
const getUnreadMessages = async (req, res) => {
  const userId = req.user.userid;
  try {
    const messages = await pool.query(
      `SELECT m.*, u.username AS sender_username
         FROM messages m
         JOIN users u ON m.sender_id = u.userid
         WHERE m.receiver_id = $1
           AND m.is_read = false
         ORDER BY COALESCE(m.delivered_at, m.created_at) ASC`,
      [userId],
    );

    const rows = await Promise.all(
      messages.rows.map(async (message) => ({
        ...message,
        sender_avatar: await createSignedStorageUrl(message.sender_avatar),
      })),
    );

    res.json(rows);

    // res.json(messageswithsender.rows);
  } catch (error) {
    console.log("Error fetching unread messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get group messages

const getGroupMessages = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;
  const { limit = 50, offset = 0 } = req.query;

  const client = await pool.connect();
  try {
    // Check if user is a member of the group
    const member = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id],
    );

    if (member.rows.length === 0) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // Get messages with sender info
    const messages = await client.query(
      `SELECT m.*, u.username as sender_username
       FROM messages m
       JOIN users u ON m.sender_id = u.userid
       WHERE m.group_id = $1
       ORDER BY m.created_at DESC
       LIMIT $2 OFFSET $3`,
      [group_id, parseInt(limit), parseInt(offset)],
    );

    res.json(messages.rows.reverse()); // Reverse to get chronological order
  } catch (error) {
    console.error("Error fetching group messages:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get private messages between two users

const getPrivateMessages = async (req, res) => {
  const { other_user_id } = req.params;
  const user_id = req.user.userid;
  const { limit = 10, offset = 0 } = req.query;
  const client = await pool.connect();
  try {
    // Check if other user exists
    const otherUser = await client.query(
      "SELECT 1 FROM users WHERE userid = $1",
      [other_user_id],
    );

    if (otherUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get messages between the two users
    const messages = await client.query(
      `
      WITH ordered_messages AS (
        SELECT
          m.*,
          u.username AS sender_username,
          u.avatar_url AS sender_avatar,
          ROW_NUMBER() OVER (
            ORDER BY COALESCE(m.delivered_at, m.created_at) ASC
          ) AS rn,
          COUNT(*) OVER() AS total_count
        FROM messages m
        JOIN users u ON m.sender_id = u.userid
        WHERE (m.sender_id = $1 AND m.receiver_id = $2)
           OR (m.sender_id = $2 AND m.receiver_id = $1)
      )
      SELECT *
      FROM ordered_messages
      WHERE rn > GREATEST(total_count - $3 - $4, 0)
      ORDER BY rn
      LIMIT $3;
      `,
      [user_id, other_user_id, parseInt(limit), parseInt(offset)],
    );
    // console.log(messages.rows);
    res.json(messages.rows);
    // Reverse to get chronological order
  } catch (error) {
    console.error("Error fetching private messages:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get user's conversations (for inbox)
const getUserConversations = async (req, res) => {
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    // Get all conversations (both sent and received)
    const conversations = await client.query(
      `SELECT DISTINCT 
              CASE 
                WHEN m.sender_id = $1 THEN m.receiver_id
                ELSE m.sender_id
              END as other_user_id,
              u.username as other_username,
              MAX(m.created_at) as last_message_time,
              COUNT(*) as message_count
       FROM messages m
       JOIN users u ON (
         CASE 
           WHEN m.sender_id = $1 THEN m.receiver_id
           ELSE m.sender_id
         END = u.userid
       )
       WHERE m.receiver_id = $1 OR m.sender_id = $1
       GROUP BY other_user_id, u.username
       ORDER BY last_message_time DESC`,
      [user_id],
    );

    res.json(conversations.rows);
    // console.log(conversations.rows);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

const syncmarking = async (req, res) => {
  const { otheruserid } = req.params;
  const userId = req.user.userid;
  const client = await pool.connect();
  try {
    const getlastsync = await client.query(
      `SELECT MAX(delivered_at) AS last_read_time 
       FROM messages 
       WHERE receiver_id = $1 
       AND sender_id = $2
       AND is_read = TRUE`,

      [userId, otheruserid],
    );

    const lastReadTime = getlastsync.rows[0].last_read_time;

    if (lastReadTime === null) {
      return res.json([]);
    }

    const syncmessage = await client.query(
      `
        SELECT id, receiver_id
        FROM messages
        WHERE receiver_id = $2
          AND sender_id = $1
          AND is_read = TRUE
          AND delivered_at > $3;`,
      [userId, otheruserid, lastReadTime],
    );

    res.json(syncmessage.rows);
  } catch (error) {
    console.error(error);
    console.log("abebe");
    res.status(500).json({ error: "Sync failed" });
  } finally {
    client.release();
  }
};

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
  const { message_id } = req.params; // <-- only message id
  const user_id = req.user.userid;
  const client = await pool.connect();
  console.log(message_id, "and", user_id);

  try {
    // Verify the message belongs to this user as receiver
    const { rows } = await client.query(
      `SELECT receiver_id FROM messages WHERE id = $1`,
      [message_id],
    );
    console.log(rows.length);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Message not found" });
    }
    console.log(rows[0].receiver_id !== user_id);
    console.log(rows[0].receiver_id !== user_id);

    if (rows[0].receiver_id !== user_id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Update single message read status
    const { rows: updatedRows } = await client.query(
      `UPDATE messages 
       SET is_read = true, read_at = NOW()
       WHERE id = $1 AND is_read = false
       RETURNING *`,
      [message_id],
    );
    console.log(updatedRows.length);
    if (updatedRows.length) {
      console.log(updatedRows.length);
      console.log("why is this happening");
      const senderSockets = onlineUsers.get(updatedRows[0].sender_id) || [];
      senderSockets.forEach((sId) =>
        getIO().to(sId).emit("message-read", {
          messageId: message_id,
          receiver_id: updatedRows[0].receiver_id,
        }),
      );

      return res.json({ success: true, messageId: message_id });
    }

    return res.json({
      success: true,
      messageId: message_id,
      alreadyRead: true,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
};

// Get unread message count
const getUnreadCount = async (req, res) => {
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    // Get unread private messages
    const privateUnread = await client.query(
      "SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = false",
      [user_id],
    );

    // Get unread group messages (for groups user is member of)
    const groupUnread = await client.query(
      `SELECT COUNT(*) 
       FROM messages m
       JOIN group_members gm ON m.group_id = gm.group_id
       WHERE gm.user_id = $1 AND m.sender_id != $1 AND m.is_read = false`,
      [user_id],
    );

    const totalUnread =
      parseInt(privateUnread.rows[0].count) +
      parseInt(groupUnread.rows[0].count);

    res.json({ unread_count: totalUnread });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

module.exports = {
  sendGroupMessage,
  sendPrivateMessage,
  sendPrivatefile,
  getGroupMessages,
  getPrivateMessages,
  getUserConversations,
  getUnreadMessages,
  markMessagesAsRead,
  getUnreadCount,
  getAllUsers,
  syncmarking,
};
