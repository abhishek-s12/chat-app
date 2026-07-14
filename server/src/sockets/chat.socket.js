const Message = require("../models/Message");
const Room = require("../models/Room");
const { sendPushNotification } = require("../utils/push");

module.exports = (io, socket) => {
  socket.on("join_room", async (roomId) => {
    socket.join(roomId);
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
  });

  socket.on("send_message", async ({ roomId, content, type = "text", replyTo }, ack) => {
    try {
      const message = await Message.create({
        room: roomId,
        sender: socket.userId,
        content,
        type,
        status: "sent",
        replyTo,
      });

      await Room.findByIdAndUpdate(roomId, { lastMessage: message._id });

      const populated = await Message.findById(message._id)
        .populate("sender", "username avatar")
        .populate({
          path: "replyTo",
          populate: { path: "sender", select: "username" },
        });

      io.to(roomId).emit("receive_message", populated);

      if (typeof ack === "function") {
        ack({ success: true, message: populated });
      }

      // Send push notifications to participants who are not actively in the socket room
      try {
        const room = await Room.findById(roomId).populate("participants", "username pushToken");
        if (room) {
          const activeUserIdsInRoom = [];
          const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
          if (socketsInRoom) {
            for (const socketId of socketsInRoom) {
              const clientSocket = io.sockets.sockets.get(socketId);
              if (clientSocket && clientSocket.userId) {
                activeUserIdsInRoom.push(clientSocket.userId.toString());
              }
            }
          }

          const pushTokens = [];
          for (const p of room.participants) {
            if (
              p._id.toString() !== socket.userId.toString() &&
              !activeUserIdsInRoom.includes(p._id.toString()) &&
              p.pushToken
            ) {
              pushTokens.push(p.pushToken);
            }
          }

          if (pushTokens.length > 0) {
            const senderName = populated.sender.username;
            const title = room.type === "group" ? `${senderName} in ${room.name}` : senderName;
            const body = type === "image" ? "📷 Sent an image" : content;

            // Send async, do not block the socket acknowledgment
            sendPushNotification(pushTokens, title, body, { roomId });
          }
        }
      } catch (pushErr) {
        console.error("Error triggering push notifications:", pushErr.message);
      }
    } catch (err) {
      if (typeof ack === "function") {
        ack({ success: false, error: err.message });
      }
    }
  });

  socket.on("message_reaction", async ({ messageId, roomId, emoji }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const existingIdx = msg.reactions.findIndex(
        (r) => r.user.toString() === socket.userId.toString()
      );

      if (existingIdx !== -1) {
        if (msg.reactions[existingIdx].emoji === emoji) {
          msg.reactions.splice(existingIdx, 1);
        } else {
          msg.reactions[existingIdx].emoji = emoji;
        }
      } else {
        msg.reactions.push({ user: socket.userId, emoji });
      }

      await msg.save();

      const populated = await Message.findById(messageId)
        .populate("sender", "username avatar")
        .populate("reactions.user", "username")
        .populate({
          path: "replyTo",
          populate: { path: "sender", select: "username" },
        });

      io.to(roomId).emit("message_reaction_update", populated);

      if (typeof ack === "function") {
        ack({ success: true, message: populated });
      }
    } catch (err) {
      if (typeof ack === "function") {
        ack({ success: false, error: err.message });
      }
    }
  });

  socket.on("message_delivered", async ({ messageId, roomId }) => {
    await Message.findByIdAndUpdate(messageId, { status: "delivered" });
    io.to(roomId).emit("message_status_update", { messageId, status: "delivered" });
  });

  socket.on("message_read", async ({ messageId, roomId }) => {
    await Message.findByIdAndUpdate(messageId, { status: "read" });
    io.to(roomId).emit("message_status_update", { messageId, status: "read" });
  });
};