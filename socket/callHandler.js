const { onlineUsers } = require("./socketState");

function registerCallHandlers(io, socket) {
  // 1. Join a call room (used for WebRTC group calls)
  socket.on("join-call-room", ({ callId }) => {
    socket.join(`call-${callId}`);
    console.log(`Socket ${socket.id} joined call room: call-${callId}`);
  });

  // 2. Leave a call room
  socket.on("leave-call-room", ({ callId }) => {
    socket.leave(`call-${callId}`);
    console.log(`Socket ${socket.id} left call room: call-${callId}`);
  });

  // 3. Relay WebRTC Signal (Offer/Answer/ICE Candidate)
  socket.on("webrtc-signal", ({ to, signal, callId }) => {
    const senderUserId = socket.handshake.query.userId;
    // console.log(`WebRTC signal from ${senderUserId} to ${to || "room call-" + callId}`);

    if (to) {
      // Direct call signaling (1-on-1)
      const targetSockets = onlineUsers.get(to) || [];
      targetSockets.forEach((sId) => {
        io.to(sId).emit("webrtc-signal", {
          from: senderUserId,
          signal,
          callId,
        });
      });
    } else if (callId) {
      // Group call signaling (broadcast to other room participants)
      socket.to(`call-${callId}`).emit("webrtc-signal", {
        from: senderUserId,
        signal,
        callId,
      });
    }
  });

  // 4. Relay Call Status Updates (Ringing, Busy, Connecting, etc.)
  socket.on("call-status-update", ({ callId, status, targetUserId }) => {
    const senderUserId = socket.handshake.query.userId;
    // console.log(`Call status update from ${senderUserId}: ${status}`);

    const payload = {
      callId,
      status,
      from: senderUserId,
    };

    if (targetUserId) {
      // Send to a specific target user
      const targetSockets = onlineUsers.get(targetUserId) || [];
      targetSockets.forEach((sId) => {
        io.to(sId).emit("call-status-update", payload);
      });
    } else if (callId) {
      // Broadcast to the whole call room
      socket.to(`call-${callId}`).emit("call-status-update", payload);
    }
  });
}

module.exports = registerCallHandlers;
