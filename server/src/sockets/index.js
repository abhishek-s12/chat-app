const socketAuthMiddleware = require("../middleware/socketAuthMiddleware");
const registerChatHandlers = require("./chat.socket");
const registerTypingHandlers = require("./typing.socket");
const registerPresenceHandlers = require("./presence.socket");

const initSockets = (io) => {
  io.use(socketAuthMiddleware);

  io.on("connection", (socket) => {
    console.log(`Socket connected: ${socket.id} (user ${socket.userId})`);

    registerChatHandlers(io, socket);
    registerTypingHandlers(io, socket);
    registerPresenceHandlers(io, socket);

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};

module.exports = initSockets;