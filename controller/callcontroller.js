const pool = require("../db/dbconfig");
const { getIO, onlineUsers } = require("../socket/socketState");
const { createSignedStorageUrl } = require("../utils/storageUrls");

/* ---------------------------------------------------------------------------
   Call-log messages.

   A resolved 1:1 call (missed, declined, or ended) gets one real row in
   `messages` — not a separate table, because `message_type` on that table has
   a CHECK constraint (text/image/file/audio/video) and this is a production
   database with real users on it; adding a value means an ALTER TABLE against
   live data, which is not something to do without asking first. So this
   reuses `message_type: 'text'` and encodes the event in `content` behind a
   prefix (U+2063, an invisible separator no keyboard or paste can produce),
   which the client detects and renders as a call pill instead of a bubble —
   see utils/messagePreview.js / MessageRenderer.jsx on the client.

   Writing a real row (instead of each client synthesizing its own local
   entry, which is what the previous approach did) is what makes this
   reliable: it goes through the exact same insert -> broadcast -> "last
   message" -> history-fetch pipeline every other message already uses, so
   both parties see it, and it is still there if you open the thread later.
   Group calls are skipped — there is no per-group message thread yet.
   --------------------------------------------------------------------------- */
const CALL_EVENT_PREFIX = "⁣call:";

async function writeCallLogMessage(client, { callerId, receiverId, callType, status, duration }) {
  if (!callerId || !receiverId) return;

  const content =
    CALL_EVENT_PREFIX +
    JSON.stringify({ call_type: callType, call_status: status, duration: duration || 0 });

  const inserted = await client.query(
    `INSERT INTO messages (sender_id, receiver_id, content, message_type, delivered_at, is_read)
     VALUES ($1, $2, $3, 'text', CURRENT_TIMESTAMP, false) RETURNING *`,
    [callerId, receiverId, content],
  );

  const sender = await client.query("SELECT username FROM users WHERE userid = $1", [callerId]);
  const messageWithSender = {
    ...inserted.rows[0],
    sender_username: sender.rows[0]?.username,
  };

  /* Unlike a normal sent message, neither side has this optimistically
     rendered already — both need the live push. */
  [callerId, receiverId].forEach((uid) => {
    (onlineUsers.get(uid) || []).forEach((sId) =>
      getIO().to(sId).emit("receive-private-message", messageWithSender),
    );
  });
}

// Initiate a voice/video call
const initiateCall = async (req, res) => {
  const { receiver_id, group_id, call_type } = req.body;
  const caller_id = req.user.userid;

  if (!call_type || !["audio", "video"].includes(call_type)) {
    return res.status(400).json({ error: "Invalid call type. Must be 'audio' or 'video'" });
  }

  if (!receiver_id && !group_id) {
    return res.status(400).json({ error: "Must provide either receiver_id or group_id" });
  }

  const client = await pool.connect();
  try {
    // Start transaction
    await client.query("BEGIN");

    // Insert call record
    const callResult = await client.query(
      `INSERT INTO calls (caller_id, receiver_id, group_id, call_type, call_status) 
       VALUES ($1, $2, $3, $4, 'ongoing') RETURNING *`,
      [caller_id, receiver_id || null, group_id || null, call_type]
    );
    const call = callResult.rows[0];

    // Add caller to participants list
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, joined_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP)`,
      [call.id, caller_id]
    );

    await client.query("COMMIT");

    // Get caller username
    const callerUser = await client.query("SELECT username, avatar_url FROM users WHERE userid = $1", [caller_id]);
    const caller_username = callerUser.rows[0]?.username || "Unknown";

    // Notify receiver(s) via real-time Socket.IO
    const incomingCallPayload = {
      callId: call.id,
      callerId: caller_id,
      callerUsername: caller_username,
      callerAvatar: await createSignedStorageUrl(callerUser.rows[0]?.avatar_url),
      callType: call_type,
      groupId: group_id,
    };

    if (receiver_id) {
      // 1-on-1 call: notify the single receiver
      const receiverSockets = onlineUsers.get(receiver_id) || [];
      receiverSockets.forEach((socketId) => {
        getIO().to(socketId).emit("incoming-call", incomingCallPayload);
      });
    } else if (group_id) {
      // Group call: notify all group members (excluding caller)
      const membersResult = await client.query(
        "SELECT user_id FROM group_members WHERE group_id = $1 AND user_id != $2",
        [group_id, caller_id]
      );
      membersResult.rows.forEach((row) => {
        const memberSockets = onlineUsers.get(row.user_id) || [];
        memberSockets.forEach((socketId) => {
          getIO().to(socketId).emit("incoming-call", incomingCallPayload);
        });
      });
    }

    res.status(201).json({
      message: "Call initiated successfully",
      call,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error initiating call:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Accept an incoming call
const acceptCall = async (req, res) => {
  const { call_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // Verify call exists and is ongoing
    const callResult = await client.query("SELECT * FROM calls WHERE id = $1 AND call_status = 'ongoing'", [call_id]);
    if (callResult.rows.length === 0) {
      return res.status(404).json({ error: "No active call found with that ID" });
    }

    const call = callResult.rows[0];

    // Add user as participant in call
    await client.query(
      `INSERT INTO call_participants (call_id, user_id, joined_at) 
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT DO NOTHING`, // handle potential double-clicks
      [call_id, user_id]
    );

    // Get list of active participants
    const activeParts = await client.query(
      "SELECT user_id FROM call_participants WHERE call_id = $1 AND left_at IS NULL AND user_id != $2",
      [call_id, user_id]
    );

    // Notify other active participants
    activeParts.rows.forEach((p) => {
      const pSockets = onlineUsers.get(p.user_id) || [];
      pSockets.forEach((sId) => {
        getIO().to(sId).emit("call-accepted", { callId: call_id, userId: user_id });
      });
    });

    res.json({ message: "Call accepted", call });
  } catch (error) {
    console.error("Error accepting call:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Reject/Decline a call
const rejectCall = async (req, res) => {
  const { call_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    const callResult = await client.query("SELECT * FROM calls WHERE id = $1", [call_id]);
    if (callResult.rows.length === 0) {
      return res.status(404).json({ error: "Call not found" });
    }

    const call = callResult.rows[0];

    // For 1-on-1 calls, rejecting terminates/misses the call
    if (call.receiver_id && call.receiver_id === user_id) {
      await client.query(
        "UPDATE calls SET call_status = 'missed', ended_at = CURRENT_TIMESTAMP WHERE id = $1",
        [call_id]
      );

      // Notify caller
      const callerSockets = onlineUsers.get(call.caller_id) || [];
      callerSockets.forEach((sId) => {
        getIO().to(sId).emit("call-rejected", { callId: call_id, userId: user_id });
      });

      if (!call.group_id) {
        await writeCallLogMessage(client, {
          callerId: call.caller_id,
          receiverId: call.receiver_id,
          callType: call.call_type,
          status: "declined",
        });
      }
    }

    res.json({ message: "Call rejected successfully" });
  } catch (error) {
    console.error("Error rejecting call:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Leave / hang up call
const endCall = async (req, res) => {
  const { call_id } = req.params;
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    // 1. Mark participant as left
    await client.query(
      "UPDATE call_participants SET left_at = CURRENT_TIMESTAMP WHERE call_id = $1 AND user_id = $2 AND left_at IS NULL",
      [call_id, user_id]
    );

    const callResult = await client.query(
      "SELECT caller_id, receiver_id, group_id, call_type, call_status FROM calls WHERE id = $1",
      [call_id]
    );
    if (callResult.rows.length === 0) {
      res.json({ message: "Call left successfully" });
      return;
    }
    const c = callResult.rows[0];
    const isDirectCall = !!c.receiver_id && !c.group_id;

    // 2. Fetch remaining active participants
    const activeParticipants = await client.query(
      "SELECT user_id FROM call_participants WHERE call_id = $1 AND left_at IS NULL",
      [call_id]
    );

    // Notify other remaining participants
    activeParticipants.rows.forEach((p) => {
      const pSockets = onlineUsers.get(p.user_id) || [];
      pSockets.forEach((sId) => {
        getIO().to(sId).emit("user-left-call", { callId: call_id, userId: user_id });
      });
    });

    /* A direct (1:1) call has no "some participants remain" state — there
       are only ever two people in it, so either one leaving ends the call
       for both. Waiting for "last one out" (the original condition here)
       meant the call row only ever reached 'ended' if *both* sides happened
       to call this endpoint independently, which in practice almost never
       happens — the side that did not click "leave" just gets the
       `user-left-call` socket event and tears its own UI down locally,
       never hitting this endpoint at all. The call stayed 'ongoing' in the
       database forever, and no call-log message could ever be written for
       it. Group calls keep the original "last one out" behavior. */
    const shouldEnd = isDirectCall || activeParticipants.rows.length === 0;

    if (shouldEnd && c.call_status === "ongoing") {
      await client.query(
        "UPDATE calls SET call_status = 'ended', ended_at = CURRENT_TIMESTAMP WHERE id = $1 AND call_status = 'ongoing'",
        [call_id]
      );

      const usersToNotify = [c.caller_id, c.receiver_id].filter(Boolean);
      usersToNotify.forEach((uid) => {
        const uSockets = onlineUsers.get(uid) || [];
        uSockets.forEach((sId) => {
          getIO().to(sId).emit("call-ended", { callId: call_id });
        });
      });

      if (isDirectCall) {
        /* Did the receiver ever actually join? If not, this was never
           answered — a cancelled-by-caller or a plain no-answer, both of
           which read the same way from either side: "missed". If they did,
           the call really happened — log it with how long it lasted. */
        const receiverJoin = await client.query(
          "SELECT joined_at FROM call_participants WHERE call_id = $1 AND user_id = $2 ORDER BY joined_at ASC LIMIT 1",
          [call_id, c.receiver_id]
        );

        if (receiverJoin.rows.length === 0) {
          await writeCallLogMessage(client, {
            callerId: c.caller_id,
            receiverId: c.receiver_id,
            callType: c.call_type,
            status: "missed",
          });
        } else {
          const durationSeconds = Math.max(
            0,
            Math.round((Date.now() - new Date(receiverJoin.rows[0].joined_at).getTime()) / 1000)
          );
          await writeCallLogMessage(client, {
            callerId: c.caller_id,
            receiverId: c.receiver_id,
            callType: c.call_type,
            status: "ended",
            duration: durationSeconds,
          });
        }
      }
    }

    res.json({ message: "Call left successfully" });
  } catch (error) {
    console.error("Error leaving call:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Retrieve call history for current user
const getCallHistory = async (req, res) => {
  const user_id = req.user.userid;
  const { limit = 20, offset = 0 } = req.query;

  const client = await pool.connect();
  try {
    const history = await client.query(
      `SELECT DISTINCT c.*,
              uc.username as caller_username,
              uc.avatar_url as caller_avatar,
              ur.username as receiver_username,
              ur.avatar_url as receiver_avatar,
              g.name as group_name
       FROM calls c
       JOIN users uc ON c.caller_id = uc.userid
       LEFT JOIN users ur ON c.receiver_id = ur.userid
       LEFT JOIN groups g ON c.group_id = g.id
       LEFT JOIN call_participants cp ON c.id = cp.call_id
       WHERE c.caller_id = $1 OR c.receiver_id = $1 OR cp.user_id = $1
       ORDER BY c.started_at DESC
       LIMIT $2 OFFSET $3`,
      [user_id, parseInt(limit), parseInt(offset)]
    );

    /* uc.avatar_url / ur.avatar_url are raw Supabase storage paths, not
       usable URLs — every other place that returns an avatar signs it first
       (see usercontroller.js, messagecontroller.js); this endpoint just
       hadn't been, so the browser tried to load the storage key as an image
       and showed a broken-image icon. */
    const rows = await Promise.all(
      history.rows.map(async (row) => ({
        ...row,
        caller_avatar: await createSignedStorageUrl(row.caller_avatar),
        receiver_avatar: await createSignedStorageUrl(row.receiver_avatar),
      })),
    );

    res.json(rows);
  } catch (error) {
    console.error("Error fetching call history:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

// Get active ongoing calls of the user
const getActiveCalls = async (req, res) => {
  const user_id = req.user.userid;

  const client = await pool.connect();
  try {
    const active = await client.query(
      `SELECT DISTINCT c.*,
              uc.username as caller_username,
              ur.username as receiver_username,
              g.name as group_name
       FROM calls c
       JOIN users uc ON c.caller_id = uc.userid
       LEFT JOIN users ur ON c.receiver_id = ur.userid
       LEFT JOIN groups g ON c.group_id = g.id
       LEFT JOIN call_participants cp ON c.id = cp.call_id
       WHERE c.call_status = 'ongoing' AND (c.caller_id = $1 OR c.receiver_id = $1 OR cp.user_id = $1)
       ORDER BY c.started_at DESC`,
      [user_id]
    );

    res.json(active.rows);
  } catch (error) {
    console.error("Error fetching active calls:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
};

module.exports = {
  initiateCall,
  acceptCall,
  rejectCall,
  endCall,
  getCallHistory,
  getActiveCalls,
};
