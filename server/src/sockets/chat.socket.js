const Message = require("../models/Message");
const Room = require("../models/Room");
const User = require("../models/User");
const { sendPushNotification } = require("../utils/push");

// Helper: populate a message fully
const populateMessage = (query) =>
  query
    .populate("sender", "username avatar")
    .populate("reactions.user", "username")
    .populate({
      path: "replyTo",
      populate: { path: "sender", select: "username" },
    });

module.exports = (io, socket) => {
  const userId = socket.userId;

  // ─── Presence ───────────────────────────────────────────────────────────────
  User.findByIdAndUpdate(userId, { isOnline: true }).catch(() => {});
  io.emit("presence_update", { userId, isOnline: true });

  socket.on("disconnect", async () => {
    const now = new Date();
    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: now }).catch(() => {});
    io.emit("presence_update", { userId, isOnline: false, lastSeen: now });
  });

  // ─── Rooms ───────────────────────────────────────────────────────────────────
  socket.on("join_room", async (roomId) => {
    socket.join(roomId);
  });

  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
  });

  // ─── Send Message ────────────────────────────────────────────────────────────
  socket.on("send_message", async ({ roomId, content, type = "text", replyTo }, ack) => {
    try {
      const message = await Message.create({
        room: roomId,
        sender: userId,
        content,
        type,
        status: "sent",
        replyTo,
      });

      await Room.findByIdAndUpdate(roomId, { lastMessage: message._id });

      const populated = await populateMessage(Message.findById(message._id));

      io.to(roomId).emit("receive_message", populated);

      if (typeof ack === "function") {
        ack({ success: true, message: populated });
      }

      // Push notifications
      try {
        const room = await Room.findById(roomId).populate("participants", "username pushToken");
        if (room) {
          const activeUserIdsInRoom = [];
          const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
          if (socketsInRoom) {
            for (const socketId of socketsInRoom) {
              const clientSocket = io.sockets.sockets.get(socketId);
              if (clientSocket?.userId) {
                activeUserIdsInRoom.push(clientSocket.userId.toString());
              }
            }
          }

          const pushTokens = room.participants
            .filter(
              (p) =>
                p._id.toString() !== userId.toString() &&
                !activeUserIdsInRoom.includes(p._id.toString()) &&
                p.pushToken
            )
            .map((p) => p.pushToken);

          if (pushTokens.length > 0) {
            const senderName = populated.sender.username;
            const title = room.type === "group" ? `${senderName} in ${room.name}` : senderName;
            const body =
              type === "image" ? "📷 Sent an image" :
              type === "audio" ? "🎤 Sent a voice message" :
              content;
            sendPushNotification(pushTokens, title, body, { roomId });
          }
        }
      } catch (pushErr) {
        console.error("Push notification error:", pushErr.message);
      }
    } catch (err) {
      if (typeof ack === "function") {
        ack({ success: false, error: err.message });
      }
    }
  });

  // ─── Edit Message ─────────────────────────────────────────────────────────────
  socket.on("edit_message", async ({ messageId, roomId, content }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg || msg.sender.toString() !== userId.toString()) {
        return ack?.({ success: false, error: "Unauthorized" });
      }

      msg.content = content.trim();
      msg.isEdited = true;
      await msg.save();

      const populated = await populateMessage(Message.findById(messageId));
      io.to(roomId).emit("message_edited", populated);
      ack?.({ success: true, message: populated });
    } catch (err) {
      ack?.({ success: false, error: err.message });
    }
  });

  // ─── Delete Message ───────────────────────────────────────────────────────────
  socket.on("delete_message", async ({ messageId, roomId }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg || msg.sender.toString() !== userId.toString()) {
        return ack?.({ success: false, error: "Unauthorized" });
      }

      msg.isDeleted = true;
      await msg.save();

      io.to(roomId).emit("message_deleted", { messageId, roomId });
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, error: err.message });
    }
  });

  // ─── Pin Message ───────────────────────────────────────────────────────────────
  socket.on("pin_message", async ({ messageId, roomId }, ack) => {
    try {
      const room = await Room.findById(roomId);
      if (!room) return ack?.({ success: false, error: "Room not found" });

      // Toggle: unpin if already pinned
      const isSame = room.pinnedMessage?.toString() === messageId;
      room.pinnedMessage = isSame ? null : messageId;
      await room.save();

      const pinnedMsg = room.pinnedMessage
        ? await populateMessage(Message.findById(room.pinnedMessage))
        : null;

      io.to(roomId).emit("message_pinned", { roomId, pinnedMessage: pinnedMsg });
      ack?.({ success: true, pinnedMessage: pinnedMsg });
    } catch (err) {
      ack?.({ success: false, error: err.message });
    }
  });

  // ─── Reactions ────────────────────────────────────────────────────────────────
  socket.on("message_reaction", async ({ messageId, roomId, emoji }, ack) => {
    try {
      const msg = await Message.findById(messageId);
      if (!msg) return;

      const existingIdx = msg.reactions.findIndex(
        (r) => r.user.toString() === userId.toString()
      );

      if (existingIdx !== -1) {
        if (msg.reactions[existingIdx].emoji === emoji) {
          msg.reactions.splice(existingIdx, 1);
        } else {
          msg.reactions[existingIdx].emoji = emoji;
        }
      } else {
        msg.reactions.push({ user: userId, emoji });
      }

      await msg.save();

      const populated = await populateMessage(Message.findById(messageId));
      io.to(roomId).emit("message_reaction_update", populated);
      ack?.({ success: true, message: populated });
    } catch (err) {
      ack?.({ success: false, error: err.message });
    }
  });

  // ─── Delivery / Read Status ───────────────────────────────────────────────────
  socket.on("message_delivered", async ({ messageId, roomId }) => {
    await Message.findByIdAndUpdate(messageId, { status: "delivered" });
    io.to(roomId).emit("message_status_update", { messageId, status: "delivered" });
  });

  socket.on("message_read", async ({ messageId, roomId }) => {
    await Message.findByIdAndUpdate(messageId, { status: "read" });
    io.to(roomId).emit("message_status_update", { messageId, status: "read" });
  });

  // ─── Typing Indicators ────────────────────────────────────────────────────────
  socket.on("typing", ({ roomId }) => {
    socket.to(roomId).emit("typing", { roomId, userId });
  });

  socket.on("stop_typing", ({ roomId }) => {
    socket.to(roomId).emit("stop_typing", { roomId, userId });
  });
};