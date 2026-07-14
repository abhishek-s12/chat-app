const User = require("../models/User");
const Room = require("../models/Room");

module.exports = (io, socket) => {
  // Mark user online and notify their contacts as soon as they connect
  const setOnline = async () => {
    await User.findByIdAndUpdate(socket.userId, { isOnline: true });

    const rooms = await Room.find({ participants: socket.userId }).select("_id");
    rooms.forEach((room) => {
      io.to(room._id.toString()).emit("user_online", { userId: socket.userId });
    });
  };

  setOnline();

  socket.on("disconnect", async () => {
    await User.findByIdAndUpdate(socket.userId, {
      isOnline: false,
      lastSeen: new Date(),
    });

    const rooms = await Room.find({ participants: socket.userId }).select("_id");
    rooms.forEach((room) => {
      io.to(room._id.toString()).emit("user_offline", {
        userId: socket.userId,
        lastSeen: new Date(),
      });
    });
  });
};
