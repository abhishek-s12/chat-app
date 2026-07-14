module.exports = (io, socket) => {
  socket.on("typing", ({ roomId }) => {
    socket.to(roomId).emit("typing", { roomId, userId: socket.userId });
  });

  socket.on("stop_typing", ({ roomId }) => {
    socket.to(roomId).emit("stop_typing", { roomId, userId: socket.userId });
  });
};
