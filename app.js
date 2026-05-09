require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const app = express();
const server = createServer(app);
const port = process.env.PORT || 5500;
require("dotenv").config();

const pool = require("./db/dbconfig.js");
app.use(cors());
app.use(express.json());

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "https://uopeoplechatting-app.netlify.app",
    ], // Add your Netlify URL
    methods: ["GET", "POST"],
  },
});

// Socket.IO connection handling
const getAllUserChats = async (userId) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT userid
       FROM users
       WHERE userid != $1
       ORDER BY username ASC`,
      [userId],
    );
    // return array of user IDs
    return rows.map((r) => r.userid);
  } catch (error) {
    console.error("Error fetching user chats:", error);
    return [];
  } finally {
    client.release();
  }
};

const onlineUsers = new Map();
io.on("connection", async (socket) => {
  const userId = socket.handshake.query.userId;

  if (!onlineUsers.has(userId)) onlineUsers.set(userId, []);
  onlineUsers.get(userId).push(socket.id);

  console.log("User connected:", userId, "and", socket.id);
  try {
    const chatUserIds = await getAllUserChats(userId);
    chatUserIds.forEach((otherUserId) => {
      const roomId = [userId, otherUserId].sort().join("-");
      socket.join(`private-${roomId}`);
      console.log(
        `Socket ${socket.id} auto-joined private chat room ${roomId}`,
      );
    });
  } catch (err) {
    console.error("Error fetching user chats:", err);
  }

  // Join a group room
  socket.on("join-group", (group_id) => {
    socket.join(`group-${group_id}`);
    console.log(`User ${socket.id} joined group ${group_id}`);
  });

  // Leave a group room

  socket.on("leave-group", (group_id) => {
    socket.leave(`group-${group_id}`);
    console.log(`User ${socket.id} left group ${group_id}`);
  });

  // Join private chat room
  socket.on("join-private-chat", (userIds) => {
    const roomId = userIds.sort().join("-");
    socket.join(`private-${roomId}`);
    console.log(`User ${socket.id} manually joined private chat ${roomId}`);
  });

  // Handle new group message
  socket.on("new-group-message", (data) => {
    socket.to(`group-${data.group_id}`).emit("receive-group-message", data);
  });

  // Handle new private message
  socket.on("new-private-message", (data) => {
    console.log("Got new-private-message:", data.content);
    const { receiver_id } = data;
    // Send to all online sockets of the receiver
    const sockets = onlineUsers.get(receiver_id) || [];
    sockets.forEach((sId) => io.to(sId).emit("receive-private-message", data));
    // const roomId = [data.sender_id, data.receiver_id].sort().join("-");
    // socket.to(`private-${roomId}`).emit("receive-private-message", data);
  });

  socket.on("disconnect", () => {
    const arr = onlineUsers.get(userId) || [];
    onlineUsers.set(
      userId,
      arr.filter((id) => id !== socket.id),
    );
    if (onlineUsers.get(userId).length === 0) onlineUsers.delete(userId);
  });
});

// Make io available to routes
app.set("io", io);
module.exports = { io, onlineUsers };

// authentication middleware
const authmiddleware = require("./middleware/authmiddleware");

// use router middleware file
const userroutes = require("./route/userroute");

const grouproutes = require("./route/grouproutes");
const messageroutes = require("./route/messageroutes");

// user middleware routes
app.use("/api/users", userroutes);

// group routes middleware
app.use("/api/groups", grouproutes);

app.use("/uploads", express.static("uploads"));

// message routes middleware
app.use("/api/messages", messageroutes);

async function start() {
  try {
    const result = await pool.query(
      "SELECT 'test connection to pg' As message",
    );
    console.log("PostgreSQL DB Connection Successful:", result.rows[0].message); // Just to confirm DB is connected

    server.listen(port, () => {
      console.log(`Server is listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to connect to DB:", error);
  }
}

start();
