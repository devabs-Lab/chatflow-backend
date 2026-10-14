const pool = require("../db/dbconfig");
const { v4: uuidv4 } = require("uuid");
const { getIO, onlineUsers } = require("../socket/socketState");
const {
  addSignedAvatarUrls,
  createSignedStorageUrl,
} = require("../utils/storageUrls");
const supabase = require("../config/supabase");

// Create a new group
const createGroup = async (req, res) => {
  const { name, description, is_private } = req.body;
  const created_by = req.user.userid;
  const client = await pool.connect();
  try {
    // Check if group name already exists
    const existingGroup = await client.query(
      "SELECT id FROM groups WHERE name = $1",
      [name]
    );

    if (existingGroup.rows.length > 0) {
      return res.status(400).json({ error: "Group name already exists" });
    }

    // Create the group
    const newGroup = await client.query(
      `INSERT INTO groups (name, description, created_by, is_private) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description, created_by, is_private || false]
    );

    // Add creator as admin member
    await client.query(
      `INSERT INTO group_members (group_id, user_id, role) 
       VALUES ($1, $2, $3)`,
      [newGroup.rows[0].id, created_by, "admin"]
    );

    res.status(201).json({
      message: "Group created successfully",
      group: newGroup.rows[0],
    });
  } catch (error) {
    console.error("Error creating group:(creategroupcontroller.js)", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get all public groups — optionally filtered by name/description (search box)
const getPublicGroups = async (req, res) => {
  const { search } = req.query;
  const client = await pool.connect();
  try {
    const params = [];
    let where = "WHERE g.is_private = false";
    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (g.name ILIKE $1 OR g.description ILIKE $1)`;
    }

    const groups = await client.query(
      `SELECT g.*,
              COUNT(gm.user_id) as member_count,
              u.username as creator_name
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN users u ON g.created_by = u.userid
       ${where}
       GROUP BY g.id, u.username
       ORDER BY g.created_at DESC`,
      params
    );

    res.json(groups.rows);
  } catch (error) {
    console.error("Error fetching public groups:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get user's joined groups
const getUserGroups = async (req, res) => {
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    // A LATERAL join pulls each group's single most recent message (if any)
    // so the inbox row can show a real preview, mirroring how
    // getUserConversations does it for direct messages.
    const groups = await client.query(
      `SELECT g.*,
              gm.role as user_role,
              COUNT(gm2.user_id) as member_count,
              u.username as creator_name,
              lm.content as last_message,
              lm.message_type as last_message_type,
              lm.filename as last_message_filename,
              lm.sender_id as last_message_sender_id,
              lm.created_at as last_message_time,
              COALESCE(ur.cnt, 0) as unread_count
       FROM groups g
       INNER JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN group_members gm2 ON g.id = gm2.group_id
       LEFT JOIN users u ON g.created_by = u.userid
       LEFT JOIN LATERAL (
         SELECT content, message_type, filename, sender_id, created_at
         FROM messages
         WHERE group_id = g.id AND channel_id IS NULL
         ORDER BY created_at DESC
         LIMIT 1
       ) lm ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS cnt
         FROM messages m2
         LEFT JOIN group_member_last_read glr
           ON glr.group_id = g.id AND glr.user_id = $1
         WHERE m2.group_id = g.id
           AND m2.channel_id IS NULL
           AND m2.sender_id <> $1
           AND m2.created_at > COALESCE(glr.last_read_at, gm.joined_at)
       ) ur ON true
       WHERE gm.user_id = $1
       GROUP BY g.id, gm.role, u.username, lm.content, lm.message_type, lm.filename, lm.sender_id, lm.created_at, ur.cnt
       ORDER BY COALESCE(lm.created_at, g.updated_at) DESC`,
      [user_id]
    );

    /* Sign each group photo before it goes out, the same way user avatars
       are signed — the column holds a storage path, not a usable URL.
       Deduped per unique path so a long list costs one signing call per
       distinct photo rather than one per row. */
    const signed = new Map();
    for (const g of groups.rows) {
      if (g.avatar_url && !signed.has(g.avatar_url)) {
        signed.set(g.avatar_url, await createSignedStorageUrl(g.avatar_url));
      }
    }

    res.json(
      groups.rows.map((g) => ({
        ...g,
        avatar_url: g.avatar_url ? signed.get(g.avatar_url) : null,
      }))
    );
  } catch (error) {
    console.error("Error fetching user groups:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Join a group
const joinGroup = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // Check if group exists and is public
    const group = await client.query("SELECT * FROM groups WHERE id = $1", [
      group_id,
    ]);

    if (group.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    if (group.rows[0].is_private) {
      return res.status(403).json({ error: "Cannot join private group" });
    }

    // Check if user is already a member
    const existingMember = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: "Already a member of this group" });
    }

    // Check if group is full
    // const memberCount = await client.query(
    //   "SELECT COUNT(*) FROM group_members WHERE group_id = $1",
    //   [group_id]
    // );

    // if (parseInt(memberCount.rows[0].count) >= group.rows[0].max_members) {
    //   return res.status(400).json({ error: "Group is full" });
    // }

    // Add user to group
    await client.query(
      "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)",
      [group_id, user_id]
    );

    res.json({ message: "Successfully joined the group" });
  } catch (error) {
    console.error("Error joining group:(joingroupcontroller.js)", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Add a member directly — the only way into a *private* group, since
// joinGroup deliberately refuses those (is_private check above). Admin-only.
const addGroupMember = async (req, res) => {
  const { group_id } = req.params;
  const { user_id: targetUserId } = req.body;
  const requesterId = req.user.userid;

  if (!targetUserId) {
    return res.status(400).json({ error: "user_id is required" });
  }

  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, requesterId]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can add members" });
    }

    const targetUser = await client.query(
      "SELECT username FROM users WHERE userid = $1",
      [targetUserId]
    );
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const existingMember = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, targetUserId]
    );
    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: "Already a member of this group" });
    }

    await client.query(
      "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)",
      [group_id, targetUserId]
    );

    // Let the added user know live, if they're online — their group list
    // otherwise only picks this up on next fetch.
    try {
      const sockets = onlineUsers.get(targetUserId) || [];
      sockets.forEach((sId) => getIO().to(sId).emit("added-to-group", { group_id }));
    } catch (err) {
      console.warn("Socket emit failed for added-to-group:", err.message);
    }

    res.json({
      message: `${targetUser.rows[0].username} added to the group`,
      user_id: targetUserId,
    });
  } catch (error) {
    console.error("Error adding group member:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Leave a group
const leaveGroup = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // Check if user is a member
    const member = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    if (member.rows.length === 0) {
      return res.status(404).json({ error: "Not a member of this group" });
    }

    // Check if user is the creator (admin)
    const group = await client.query(
      "SELECT created_by FROM groups WHERE id = $1",
      [group_id]
    );

    if (group.rows[0].created_by === user_id) {
      return res.status(400).json({
        error:
          "Group creator cannot leave. Transfer ownership or delete the group.",
      });
    }

    // Remove user from group
    await client.query(
      "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    res.json({ message: "Successfully left the group" });
  } catch (error) {
    console.error("Error leaving group:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get group details, including the full member list with roles. The group
// info panel renders straight off this, so it carries everything that
// panel shows: the group's own fields, who created it, and every member
// with a signed avatar and their role.
const getGroupDetails = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // Check if user is a member
    const member = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    if (member.rows.length === 0) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // Get group details with member count
    const group = await client.query(
      `SELECT g.*,
              COUNT(gm.user_id) as member_count,
              u.username as creator_name
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN users u ON g.created_by = u.userid
       WHERE g.id = $1
       GROUP BY g.id, u.username`,
      [group_id]
    );

    if (group.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    const members = await client.query(
      `SELECT u.userid, u.username, u.avatar_url, u.bio, u.status, u.last_seen,
              gm.role, gm.joined_at, gm.can_delete_messages
       FROM group_members gm
       JOIN users u ON u.userid = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY
         CASE WHEN u.userid = $2 THEN 0
              WHEN gm.role = 'admin' THEN 1
              ELSE 2 END,
         u.username ASC`,
      [group_id, group.rows[0].created_by]
    );

    // The pinned message, resolved so the pinned bar can render without a
    // second round trip.
    let pinnedMessage = null;
    if (group.rows[0].pinned_message_id) {
      const pinned = await client.query(
        `SELECT m.id, m.content, m.message_type, m.filename, m.created_at,
                u.username AS sender_username
         FROM messages m
         LEFT JOIN users u ON u.userid = m.sender_id
         WHERE m.id = $1 AND m.is_deleted IS NOT TRUE`,
        [group.rows[0].pinned_message_id]
      );
      pinnedMessage = pinned.rows[0] || null;
    }

    res.json({
      ...group.rows[0],
      avatar_url: await createSignedStorageUrl(group.rows[0].avatar_url),
      user_role: member.rows[0].role,
      is_owner: group.rows[0].created_by === user_id,
      can_delete_messages: member.rows[0].can_delete_messages,
      pinned_message: pinnedMessage,
      members: await addSignedAvatarUrls(members.rows),
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Update a group's own fields — name, description, and its public
// @username. Admins only.
const updateGroup = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;
  const { name, description, username, is_private } = req.body;
  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can edit the group" });
    }

    /* A username is a public handle, so it gets the same treatment as one:
       a restricted character set, a length floor, and case-insensitive
       uniqueness (enforced by an index, but checked here to return a
       friendly message rather than a 500 on a constraint violation). */
    let normalisedUsername;
    if (username !== undefined) {
      const trimmed = (username || "").trim().replace(/^@/, "");
      if (trimmed === "") {
        normalisedUsername = null;
      } else {
        if (!/^[A-Za-z0-9_]{5,32}$/.test(trimmed)) {
          return res.status(400).json({
            error:
              "Username must be 5-32 characters, letters, numbers and underscores only",
          });
        }
        const taken = await client.query(
          "SELECT id FROM groups WHERE LOWER(username) = LOWER($1) AND id <> $2",
          [trimmed, group_id]
        );
        if (taken.rows.length > 0) {
          return res.status(400).json({ error: "That username is already taken" });
        }
        normalisedUsername = trimmed;
      }
    }

    if (name !== undefined && !String(name).trim()) {
      return res.status(400).json({ error: "Group name cannot be empty" });
    }

    const updated = await client.query(
      `UPDATE groups
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           username    = CASE WHEN $3::boolean THEN $4 ELSE username END,
           is_private  = COALESCE($5, is_private),
           updated_at  = NOW()
       WHERE id = $6
       RETURNING *`,
      [
        name !== undefined ? String(name).trim() : null,
        description !== undefined ? description : null,
        username !== undefined,
        normalisedUsername ?? null,
        is_private !== undefined ? is_private : null,
        group_id,
      ]
    );

    res.json({ message: "Group updated", group: updated.rows[0] });
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Promote a member to admin or demote them back. Admins can promote;
// only the owner (created_by) can demote, and the owner can never be
// demoted — otherwise a group could be left with nobody able to manage it.
const setMemberRole = async (req, res) => {
  const { group_id, user_id: targetUserId } = req.params;
  const { role } = req.body;
  const requesterId = req.user.userid;

  if (!["admin", "member"].includes(role)) {
    return res.status(400).json({ error: "Role must be 'admin' or 'member'" });
  }

  const client = await pool.connect();
  try {
    const group = await client.query("SELECT created_by FROM groups WHERE id = $1", [
      group_id,
    ]);
    if (group.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }
    const ownerId = group.rows[0].created_by;

    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, requesterId]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can change roles" });
    }

    if (targetUserId === ownerId) {
      return res.status(400).json({ error: "The group owner's role cannot be changed" });
    }
    if (role === "member" && requesterId !== ownerId) {
      return res
        .status(403)
        .json({ error: "Only the group owner can remove an admin" });
    }

    const target = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, targetUserId]
    );
    if (target.rows.length === 0) {
      return res.status(404).json({ error: "That person is not a member of this group" });
    }

    await client.query(
      "UPDATE group_members SET role = $1 WHERE group_id = $2 AND user_id = $3",
      [role, group_id, targetUserId]
    );

    try {
      const sockets = onlineUsers.get(targetUserId) || [];
      sockets.forEach((sId) =>
        getIO().to(sId).emit("group-role-changed", { group_id, role })
      );
    } catch (err) {
      console.warn("Socket emit failed for group-role-changed:", err.message);
    }

    res.json({ message: role === "admin" ? "Promoted to admin" : "Removed as admin", role });
  } catch (error) {
    console.error("Error setting member role:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

/* ------------------------------------------------------------------ invites */

const generateInviteToken = () => uuidv4().replace(/-/g, "").slice(0, 22);

// Create a shareable invite link. Admins only. `expires_in_hours` and
// `max_uses` are both optional — omitting them makes a link that never
// expires and can be used any number of times, which is the common case.
const createGroupInvite = async (req, res) => {
  const { group_id } = req.params;
  const { expires_in_hours, max_uses } = req.body || {};
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can create invite links" });
    }

    const expiresAt = expires_in_hours
      ? new Date(Date.now() + Number(expires_in_hours) * 3600 * 1000)
      : null;

    const invite = await client.query(
      `INSERT INTO group_invites (group_id, token, created_by, expires_at, max_uses)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        group_id,
        generateInviteToken(),
        user_id,
        expiresAt,
        max_uses ? Number(max_uses) : null,
      ]
    );

    res.status(201).json({ message: "Invite link created", invite: invite.rows[0] });
  } catch (error) {
    console.error("Error creating group invite:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Every live invite link for a group, newest first. Admins only — a link
// is a credential, so non-admins have no business listing them.
const getGroupInvites = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can view invite links" });
    }

    const invites = await client.query(
      `SELECT gi.*, u.username AS created_by_name
       FROM group_invites gi
       LEFT JOIN users u ON u.userid = gi.created_by
       WHERE gi.group_id = $1 AND gi.revoked = FALSE
       ORDER BY gi.created_at DESC`,
      [group_id]
    );

    res.json(invites.rows);
  } catch (error) {
    console.error("Error fetching group invites:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

const revokeGroupInvite = async (req, res) => {
  const { group_id, token } = req.params;
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can revoke invite links" });
    }

    const revoked = await client.query(
      `UPDATE group_invites SET revoked = TRUE
       WHERE group_id = $1 AND token = $2 RETURNING id`,
      [group_id, token]
    );
    if (revoked.rows.length === 0) {
      return res.status(404).json({ error: "Invite link not found" });
    }

    res.json({ message: "Invite link revoked" });
  } catch (error) {
    console.error("Error revoking group invite:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

/* Shared by the preview and the join: resolves a token to a usable invite
   or an explanatory error, so both paths reject an expired/exhausted link
   the same way. */
const loadUsableInvite = async (client, token) => {
  const { rows } = await client.query(
    `SELECT gi.*, g.name, g.description, g.is_private, g.username AS group_username,
            (SELECT COUNT(*) FROM group_members WHERE group_id = gi.group_id) AS member_count
     FROM group_invites gi
     JOIN groups g ON g.id = gi.group_id
     WHERE gi.token = $1`,
    [token]
  );
  if (rows.length === 0) return { error: "This invite link is not valid" };
  const invite = rows[0];
  if (invite.revoked) return { error: "This invite link has been revoked" };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: "This invite link has expired" };
  }
  if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
    return { error: "This invite link has reached its limit" };
  }
  return { invite };
};

// What the link points at, before committing to joining — so the join
// screen can say which group you're about to join.
const previewGroupInvite = async (req, res) => {
  const { token } = req.params;
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const { invite, error } = await loadUsableInvite(client, token);
    if (error) return res.status(404).json({ error });

    const existing = await client.query(
      "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
      [invite.group_id, user_id]
    );

    res.json({
      group_id: invite.group_id,
      name: invite.name,
      description: invite.description,
      username: invite.group_username,
      member_count: Number(invite.member_count),
      already_member: existing.rows.length > 0,
    });
  } catch (error) {
    console.error("Error previewing group invite:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Join via an invite link. This is the only route into a *private* group
// besides an admin adding you directly — joinGroup still refuses those.
const joinGroupByInvite = async (req, res) => {
  const { token } = req.params;
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const { invite, error } = await loadUsableInvite(client, token);
    if (error) return res.status(404).json({ error });

    const existing = await client.query(
      "SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2",
      [invite.group_id, user_id]
    );
    if (existing.rows.length > 0) {
      return res.json({
        message: "You're already a member of this group",
        group_id: invite.group_id,
        already_member: true,
      });
    }

    await client.query(
      "INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)",
      [invite.group_id, user_id]
    );
    await client.query(
      "UPDATE group_invites SET uses = uses + 1 WHERE id = $1",
      [invite.id]
    );

    res.json({
      message: `You joined ${invite.name}`,
      group_id: invite.group_id,
      already_member: false,
    });
  } catch (error) {
    console.error("Error joining group by invite:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Group photo. Same shape as the user avatar upload in usercontroller.js:
// the storage path is what gets stored, and a signed URL is what goes out.
const uploadGroupAvatar = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;
  const file = req.file;

  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can change the group photo" });
    }

    const fileName = `group-${group_id}-${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    const { data, error } = await supabase.storage
      .from("chat-files")
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      console.error("Supabase group avatar upload error:", error);
      return res.status(500).json({ error: "Upload failed" });
    }

    await client.query("UPDATE groups SET avatar_url = $1, updated_at = NOW() WHERE id = $2", [
      data.path,
      group_id,
    ]);

    res.json({
      message: "Group photo updated",
      avatar_url: await createSignedStorageUrl(data.path),
    });
  } catch (error) {
    console.error("Error uploading group avatar:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Pin or unpin a message. One pinned message at a time, like Telegram's
// pinned bar — pass message_id: null to clear it.
const setPinnedMessage = async (req, res) => {
  const { group_id } = req.params;
  const { message_id } = req.body;
  const user_id = req.user.userid;
  const client = await pool.connect();
  try {
    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can pin messages" });
    }

    if (message_id) {
      const message = await client.query(
        "SELECT id FROM messages WHERE id = $1 AND group_id = $2 AND is_deleted IS NOT TRUE",
        [message_id, group_id]
      );
      if (message.rows.length === 0) {
        return res.status(404).json({ error: "That message isn't in this group" });
      }
    }

    await client.query("UPDATE groups SET pinned_message_id = $1 WHERE id = $2", [
      message_id || null,
      group_id,
    ]);

    try {
      getIO()
        .to(`group-${group_id}`)
        .emit("group-pinned-changed", { group_id, message_id: message_id || null });
    } catch (err) {
      console.warn("Socket emit failed for group-pinned-changed:", err.message);
    }

    res.json({ message: message_id ? "Message pinned" : "Message unpinned" });
  } catch (error) {
    console.error("Error pinning message:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Grant or revoke an admin's right to delete other people's messages.
// Owner only — this is the "if the owner gives him access" half of the
// moderation rule; being an admin alone does not carry it.
const setMemberPermissions = async (req, res) => {
  const { group_id, user_id: targetUserId } = req.params;
  const { can_delete_messages } = req.body;
  const requesterId = req.user.userid;
  const client = await pool.connect();
  try {
    const group = await client.query("SELECT created_by FROM groups WHERE id = $1", [
      group_id,
    ]);
    if (group.rows.length === 0) return res.status(404).json({ error: "Group not found" });
    if (group.rows[0].created_by !== requesterId) {
      return res
        .status(403)
        .json({ error: "Only the group owner can change moderation rights" });
    }

    const updated = await client.query(
      `UPDATE group_members SET can_delete_messages = $1
       WHERE group_id = $2 AND user_id = $3 RETURNING can_delete_messages`,
      [Boolean(can_delete_messages), group_id, targetUserId]
    );
    if (updated.rows.length === 0) {
      return res.status(404).json({ error: "That person is not a member of this group" });
    }

    res.json({
      message: can_delete_messages
        ? "This admin can now delete anyone's messages"
        : "This admin can no longer delete other people's messages",
      can_delete_messages: updated.rows[0].can_delete_messages,
    });
  } catch (error) {
    console.error("Error setting member permissions:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Remove someone from a group. Admins only; the owner can't be removed,
// and an admin can't remove a fellow admin (only the owner can).
const removeGroupMember = async (req, res) => {
  const { group_id, user_id: targetUserId } = req.params;
  const requesterId = req.user.userid;
  const client = await pool.connect();
  try {
    const group = await client.query("SELECT created_by FROM groups WHERE id = $1", [
      group_id,
    ]);
    if (group.rows.length === 0) return res.status(404).json({ error: "Group not found" });
    const ownerId = group.rows[0].created_by;

    const requester = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, requesterId]
    );
    if (requester.rows.length === 0 || requester.rows[0].role !== "admin") {
      return res.status(403).json({ error: "Only a group admin can remove members" });
    }
    if (targetUserId === ownerId) {
      return res.status(400).json({ error: "The group owner can't be removed" });
    }

    const target = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, targetUserId]
    );
    if (target.rows.length === 0) {
      return res.status(404).json({ error: "That person is not a member of this group" });
    }
    if (target.rows[0].role === "admin" && requesterId !== ownerId) {
      return res.status(403).json({ error: "Only the group owner can remove an admin" });
    }

    await client.query(
      "DELETE FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, targetUserId]
    );

    try {
      const sockets = onlineUsers.get(targetUserId) || [];
      sockets.forEach((sId) =>
        getIO().to(sId).emit("removed-from-group", { group_id })
      );
    } catch (err) {
      console.warn("Socket emit failed for removed-from-group:", err.message);
    }

    res.json({ message: "Member removed" });
  } catch (error) {
    console.error("Error removing group member:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

module.exports = {
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
};
