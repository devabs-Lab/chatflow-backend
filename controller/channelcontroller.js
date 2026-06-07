const pool = require("../db/dbconfig");
const { getIO } = require("../socket/socketState");

// Create a new channel inside a group
const createChannel = async (req, res) => {
  const { group_id } = req.params;
  const { name, type = "text" } = req.body;
  const user_id = req.user.userid;

  if (!name) {
    return res.status(400).json({ error: "Channel name is required" });
  }

  const client = await pool.connect();
  try {
    // Check if group exists
    const groupResult = await client.query("SELECT created_by FROM groups WHERE id = $1", [group_id]);
    if (groupResult.rows.length === 0) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Check if user is an admin of the group or group creator
    const memberResult = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    const role = memberResult.rows[0].role;
    const isCreator = groupResult.rows[0].created_by === user_id;

    if (role !== "admin" && !isCreator) {
      return res.status(403).json({ error: "Only admins or creators can create channels" });
    }

    // Create the channel
    const newChannel = await client.query(
      `INSERT INTO channels (group_id, name, type, created_by) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [group_id, name, type, user_id]
    );

    const channel = newChannel.rows[0];

    // Emit socket event to the group
    try {
      getIO().to(`group-${group_id}`).emit("channel-created", { channel, group_id });
    } catch (err) {
      console.warn("Socket notification failed for channel creation:", err.message);
    }

    res.status(201).json({
      message: "Channel created successfully",
      channel,
    });
  } catch (error) {
    console.error("Error creating channel:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get all channels of a group
const getGroupChannels = async (req, res) => {
  const { group_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // Check if user is a member of the group
    const member = await client.query(
      "SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    if (member.rows.length === 0) {
      return res.status(403).json({ error: "Not a member of this group" });
    }

    // Fetch all channels
    const channels = await client.query(
      "SELECT * FROM channels WHERE group_id = $1 ORDER BY created_at ASC",
      [group_id]
    );

    res.json(channels.rows);
  } catch (error) {
    console.error("Error fetching group channels:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Delete a channel
const deleteChannel = async (req, res) => {
  const { channel_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // Check if channel exists
    const channelResult = await client.query("SELECT * FROM channels WHERE id = $1", [channel_id]);
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const channel = channelResult.rows[0];
    const group_id = channel.group_id;

    // Check permissions (must be admin or creator of the parent group)
    const groupResult = await client.query("SELECT created_by FROM groups WHERE id = $1", [group_id]);
    const memberResult = await client.query(
      "SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2",
      [group_id, user_id]
    );

    if (memberResult.rows.length === 0) {
      return res.status(403).json({ error: "Not a member of the parent group" });
    }

    const role = memberResult.rows[0].role;
    const isCreator = groupResult.rows[0].created_by === user_id;

    if (role !== "admin" && !isCreator) {
      return res.status(403).json({ error: "Only admins or group creators can delete channels" });
    }

    // Delete the channel
    await client.query("DELETE FROM channels WHERE id = $1", [channel_id]);

    // Emit socket event to the group
    try {
      getIO().to(`group-${group_id}`).emit("channel-deleted", { channel_id, group_id });
    } catch (err) {
      console.warn("Socket notification failed for channel deletion:", err.message);
    }

    res.json({ message: "Channel deleted successfully" });
  } catch (error) {
    console.error("Error deleting channel:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

module.exports = {
  createChannel,
  getGroupChannels,
  deleteChannel,
};
