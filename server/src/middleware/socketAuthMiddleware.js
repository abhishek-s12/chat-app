const { verifyToken } = require("../utils/jwt");

// Runs once per socket connection attempt, before "connection" fires.
// Client must send the JWT like: io(URL, { auth: { token } })
const socketAuthMiddleware = (socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("Authentication error: no token"));
  }

  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error("Authentication error: invalid token"));
  }
};

module.exports = socketAuthMiddleware;
