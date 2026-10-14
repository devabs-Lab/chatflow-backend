require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { createServer } = require("http");
const { Server } = require("socket.io");
const { setIO, onlineUsers } = require("./socket/socketState");
const app = express();
const server = createServer(app);
const port = process.env.PORT || 5500;

const pool = require("./db/dbconfig.js");
const requestLogger = require("./middleware/requestLogger");
const createRateLimiter = require("./middleware/rateLimiter");

app.use(cors());
app.use(express.json());
app.use(requestLogger);
app.use(
  createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 200,
    keyPrefix: "global",
  }),
);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    // Vite defaults to 5173; 5174/5175 are the fallbacks it picks when
    // that port is taken. Add your deployed front-end origin here too.
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    methods: ["GET", "POST"],
  },
});

// Register io in shared state so controllers can access it without importing app.js
setIO(io);

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

// onlineUsers is imported from socketState — same Map instance used by controllers
io.on("connection", async (socket) => {
  const userId = socket.handshake.query.userId;

  if (!onlineUsers.has(userId)) onlineUsers.set(userId, []);
  onlineUsers.get(userId).push(socket.id);

  console.log("User connected:", userId, "and", socket.id);

  /* All socket.on(...) registrations below used to come AFTER the `await
     getAllUserChats(...)` further down. Socket.IO dispatches an incoming
     event synchronously against whatever listeners exist on the socket at
     the moment it arrives — there is no server-side buffering for events
     received before a listener is registered, unlike the client-side
     buffering socket.io-client does for emits sent before "connect". So a
     client that emits (say) "join-group" immediately upon connecting could
     have that event silently dropped if this DB query — which can take
     anywhere from a few ms to multiple seconds against Supabase — hadn't
     resolved yet. This was invisible as long as every emit happened well
     after page load (opening a chat, starting a call), but session 10's
     Chat.jsx joins every group room proactively right after connecting,
     which lands squarely in this window and made the drop real and
     reproducible in live two-tab testing. Registering listeners first,
     synchronously, closes the gap entirely regardless of how slow the
     query is. */

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

  // Join a specific channel room (Discord-style channel)
  socket.on("join-channel", (channel_id) => {
    socket.join(`channel-${channel_id}`);
    console.log(`User ${socket.id} joined channel ${channel_id}`);
  });

  // Leave a specific channel room
  socket.on("leave-channel", (channel_id) => {
    socket.leave(`channel-${channel_id}`);
    console.log(`User ${socket.id} left channel ${channel_id}`);
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

  // Register WebRTC calling event handlers
  const registerCallHandlers = require("./socket/callHandler");
  registerCallHandlers(io, socket);

  socket.on("disconnect", () => {
    const arr = onlineUsers.get(userId) || [];
    onlineUsers.set(
      userId,
      arr.filter((id) => id !== socket.id),
    );
    if (onlineUsers.get(userId).length === 0) onlineUsers.delete(userId);
  });

  // Auto-join every private-chat room this user could receive a message in.
  // Deliberately after every socket.on(...) above (see the comment at the
  // top of this handler) — this can take a while against Supabase, and
  // nothing here depends on it having finished.
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
});

// io is available to routes via socketState.getIO() — no need to export from app.js

// authentication middleware
const authmiddleware = require("./middleware/authmiddleware");

// use router middleware file
const userroutes = require("./route/userroute");

const grouproutes = require("./route/grouproutes");
const messageroutes = require("./route/messageroutes");
const channelroutes = require("./route/channelroutes");
const callroutes = require("./route/callroutes");

// user middleware routes
app.use("/api/users", userroutes);

// group routes middleware
app.use("/api/groups", grouproutes);

// channel routes middleware
app.use("/api/channels", channelroutes);

// call routes middleware
app.use("/api/calls", callroutes);

app.use("/uploads", express.static("uploads"));

// message routes middleware
app.use("/api/messages", messageroutes);

// global error handling middleware
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
app.use(notFoundHandler);
app.use(errorHandler);

async function start() {
  try {
    const result = await pool.query(
      "SELECT 'test connection to pg' As message",
    );
    console.log("PostgreSQL DB Connection Successful:", result.rows[0].message);
  } catch (error) {
    console.warn(
      "Warning: DB connection failed, continuing anyway:",
      error.message,
    );
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server is listening on port ${port}`);
  });
}

start();
