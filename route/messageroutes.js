const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");
const verifyStreamToken = require("../middleware/streamAuth");
const { upload } = require("../storage/Storageconfig");
const {
  sendGroupMessage,
  sendGroupFile,
  sendPrivateMessage,
  sendPrivatefile,
  getGroupMessages,
  getPrivateMessages,
  getUserConversations,
  getUnreadMessages,
  markMessagesAsRead,
  markGroupAsRead,
  markChannelAsRead,
  getUnreadCount,
  getAllUsers,
  syncmarking,
} = require("../controller/messagecontroller");
const { streamOrDownloadFile } = require("../controller/fileController");

// All routes require authentication

router.use(authmiddleware);

// Group messages
router.post("/file/group", upload.single("file"), sendGroupFile);
router.post("/group/:group_id", sendGroupMessage);
router.get("/group/:group_id", getGroupMessages);

// Private messages

router.post("/file/private", upload.single("file"), sendPrivatefile);
router.post("/private/:receiver_id", sendPrivateMessage);
router.get("/private/:other_user_id", getPrivateMessages);
router.get("/file/download/:messageId", streamOrDownloadFile); //for local or aws streaming

// Conversations and inbox
router.get("/conversations", getUserConversations);
router.get("/unread-count", getUnreadCount);
router.get("/users/all", getAllUsers);
router.get("/unread", getUnreadMessages);
router.get("/syncread/:otheruserid", syncmarking);

// Mark messages as read
router.put("/read/group/:group_id", markGroupAsRead);
router.put("/read/channel/:channel_id", markChannelAsRead);
router.put("/read/private/:message_id", markMessagesAsRead);

module.exports = router;
