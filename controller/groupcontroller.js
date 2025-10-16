const pool = require("../db/dbconfig");
const { v4: uuidv4 } = require("uuid");

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

// Get all public groups
const getPublicGroups = async (req, res) => {
  const client = await pool.connect();
  try {
    const groups = await client.query(
      `SELECT g.*, 
              COUNT(gm.user_id) as member_count,
              u.username as creator_name
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN users u ON g.created_by = u.userid
       WHERE g.is_private = false
       GROUP BY g.id, u.username
       ORDER BY g.created_at DESC`
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
    const groups = await client.query(
      `SELECT g.*, 
              gm.role as user_role,
              COUNT(gm2.user_id) as member_count,
              u.username as creator_name
       FROM groups g
       INNER JOIN group_members gm ON g.id = gm.group_id
       LEFT JOIN group_members gm2 ON g.id = gm2.group_id
       LEFT JOIN users u ON g.created_by = u.userid
       WHERE gm.user_id = $1
       GROUP BY g.id, gm.role, u.username
       ORDER BY g.updated_at DESC`,
      [user_id]
    );

    res.json(groups.rows);
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

// Get group details
const getGroupDetails = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.id;

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
       LEFT JOIN users u ON g.created_by = u.id
       WHERE g.id = $1
       GROUP BY g.id, u.username`,
      [group_id]
    );

    if (group.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    res.json(group.rows[0]);
  } catch (error) {
    console.error("Error fetching group details:", error);
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
  leaveGroup,
  getGroupDetails,
};
