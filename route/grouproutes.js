const express = require("express");
const router = express.Router();
const authmiddleware = require("../middleware/authmiddleware");

const {
  createGroup,
  getPublicGroups,
  getUserGroups,
  joinGroup,
  addGroupMember,
  leaveGroup,
  getGroupDetails,
  updateGroup,
  setMemberRole,
  setMemberPermissions,
  removeGroupMember,
  uploadGroupAvatar,
  setPinnedMessage,
  createGroupInvite,
  getGroupInvites,
  revokeGroupInvite,
  previewGroupInvite,
  joinGroupByInvite,
} = require("../controller/groupcontroller");

// All routes require authentication
router.use(authmiddleware);

const { validateCreateGroup } = require("../middleware/validationSchemas");
const { upload } = require("../storage/Storageconfig");

// Create a new group
router.post("/", validateCreateGroup, createGroup);

// Get all public groups
router.get("/public", getPublicGroups);

// Get user's joined groups
router.get("/my-groups", getUserGroups);

/* Invite links. These sit above "/:group_id" so "invite" and "join" are
   never swallowed as a group id by the parameterised route below. */
router.get("/invite/:token", previewGroupInvite);
router.post("/invite/:token/join", joinGroupByInvite);

// Get group details (includes the member list with roles)
router.get("/:group_id", getGroupDetails);

// Edit group name / description / @username — admin only
router.patch("/:group_id", updateGroup);

// Join a group
router.post("/:group_id/join", joinGroup);

// Add a member directly — admin-only, the way into a private group
router.post("/:group_id/members", addGroupMember);

// Promote to admin / remove as admin
router.patch("/:group_id/members/:user_id/role", setMemberRole);

// Owner-only: grant or revoke an admin's right to delete anyone's messages
router.patch("/:group_id/members/:user_id/permissions", setMemberPermissions);

// Remove someone from the group — admin only
router.delete("/:group_id/members/:user_id", removeGroupMember);

// Group photo — admin only
router.post("/:group_id/avatar", upload.single("avatar"), uploadGroupAvatar);

// Pin / unpin a message — admin only
router.put("/:group_id/pinned", setPinnedMessage);

// Manage this group's invite links — admin only
router.get("/:group_id/invites", getGroupInvites);
router.post("/:group_id/invites", createGroupInvite);
router.delete("/:group_id/invites/:token", revokeGroupInvite);

// Leave a group
router.delete("/:group_id/leave", leaveGroup);

module.exports = router;
