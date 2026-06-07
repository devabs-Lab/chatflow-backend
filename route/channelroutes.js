const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");
const {
  createChannel,
  getGroupChannels,
  deleteChannel,
} = require("../controller/channelcontroller");

// All channel routes require authentication
router.use(authmiddleware);

const { validateCreateChannel } = require("../middleware/validationSchemas");

// Channel routes
router.post("/group/:group_id", validateCreateChannel, createChannel);
router.get("/group/:group_id", getGroupChannels);
router.delete("/:channel_id", deleteChannel);

module.exports = router;
