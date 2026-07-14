const Message = require("../models/Message");
const Room = require("../models/Room");

// GET /api/messages/:roomId?page=1&limit=30
const getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;

    const messages = await Message.find({ room: roomId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("sender", "username avatar");

    res.json({ messages: messages.reverse(), page });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// GET /api/conversations
const getConversations = async (req, res) => {
  try {
    const rooms = await Room.find({ participants: req.userId })
      .populate("participants", "username avatar isOnline")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });

    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = { getMessages, getConversations };
