const Message = require("../models/Message");
const Room = require("../models/Room");

// Helper: populate a message fully
const populateMessage = (query) =>
  query
    .populate("sender", "username avatar")
    .populate("reactions.user", "username")
    .populate({
      path: "replyTo",
      populate: { path: "sender", select: "username" },
    });

// GET /api/messages/:roomId?page=1&limit=30
const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const messages = await populateMessage(
      Message.find({ room: roomId })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    );

    res.json({ messages: messages.reverse(), page });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/messages/:roomId/search?query=keyword
const searchMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { query } = req.query;
    if (!query || !query.trim()) {
      return res.status(400).json({ message: "Search query is required" });
    }

    const messages = await populateMessage(
      Message.find({
        room: roomId,
        isDeleted: { $ne: true },
        content: { $regex: query.trim(), $options: "i" },
      }).sort({ createdAt: 1 })
    );

    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/conversations
const getConversations = async (req, res) => {
  try {
    const rooms = await Room.find({ participants: req.userId })
      .populate("participants", "username avatar isOnline lastSeen")
      .populate("lastMessage")
      .populate({
        path: "pinnedMessage",
        populate: { path: "sender", select: "username" },
      })
      .sort({ updatedAt: -1 });

    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// PATCH /api/messages/:messageId  { content }
const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    if (!content?.trim()) {
      return res.status(400).json({ message: "Content cannot be empty" });
    }

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.sender.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only edit your own messages" });
    }
    if (message.type !== "text") {
      return res.status(400).json({ message: "Only text messages can be edited" });
    }

    message.content = content.trim();
    message.isEdited = true;
    await message.save();

    const populated = await populateMessage(Message.findById(messageId));
    res.json({ message: populated });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// DELETE /api/messages/:messageId
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });
    if (message.sender.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: "You can only delete your own messages" });
    }

    message.isDeleted = true;
    await message.save();
    res.json({ message: "Message deleted" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { getMessages, searchMessages, getConversations, editMessage, deleteMessage };
