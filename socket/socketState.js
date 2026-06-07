// socketState.js
// Single source of truth for the Socket.IO instance and online users map.
// app.js calls setIO(io) once after creating the server.
// Controllers import getIO() and onlineUsers from here instead of app.js.

let _io = null;

// All socket handlers in app.js must use this same Map instance
const onlineUsers = new Map();

function setIO(ioInstance) {
  _io = ioInstance;
}

function getIO() {
  if (!_io) throw new Error("Socket.IO has not been initialized yet.");
  return _io;
}

module.exports = { setIO, getIO, onlineUsers };
