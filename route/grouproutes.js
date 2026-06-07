const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");

const {
  createGroup,
  getPublicGroups,
  getUserGroups,
  joinGroup,
  leaveGroup,
  getGroupDetails,
} = require("../controller/groupcontroller");

// All routes require authentication
router.use(authmiddleware);

const { validateCreateGroup } = require("../middleware/validationSchemas");

// Create a new group
router.post("/", validateCreateGroup, createGroup);

// Get all public groups
router.get("/public", getPublicGroups);

// Get user's joined groups
router.get("/my-groups", getUserGroups);

// Get group details
router.get("/:group_id", getGroupDetails);

// Join a group
router.post("/:group_id/join", joinGroup);

// Leave a group
router.delete("/:group_id/leave", leaveGroup);

module.exports = router;
