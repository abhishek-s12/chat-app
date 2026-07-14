const Room = require("../models/Room");
const User = require("../models/User");
const Message = require("../models/Message");

// GET /api/users/search?query=john
const searchUsers = async (req, res) => {
  const { query } = req.query;
  const users = await User.find({
    username: { $regex: query, $options: "i" },
    _id: { $ne: req.userId },
  }).select("username avatar isOnline lastSeen").limit(20);
  res.json({ users });
};

// POST /api/rooms  { participantId }  -> creates or returns existing direct room
const createOrGetDirectRoom = async (req, res) => {
  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ message: "participantId required" });

  let room = await Room.findOne({
    type: "direct",
    participants: { $all: [req.userId, participantId], $size: 2 },
  }).populate("participants", "username avatar isOnline lastSeen");

  if (!room) {
    room = await Room.create({
      type: "direct",
      participants: [req.userId, participantId],
    });
    room = await room.populate("participants", "username avatar isOnline lastSeen");
  }

  res.status(201).json({ room });
};

// POST /api/rooms/group  { participantIds, name } -> creates a group room
const createGroupRoom = async (req, res) => {
  const { participantIds, name } = req.body;
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ message: "participantIds array is required" });
  }

  const uniqueParticipants = [...new Set([...participantIds, req.userId])];

  try {
    let room = await Room.create({
      type: "group",
      name: name || "Group Chat",
      participants: uniqueParticipants,
    });
    room = await room.populate("participants", "username avatar isOnline lastSeen");
    res.status(201).json({ room });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/rooms/:roomId/pin  { messageId }  -> pin a message (null to unpin)
const pinMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { messageId } = req.body; // null to unpin

    // Verify the room exists and user is a participant
    const room = await Room.findOne({ _id: roomId, participants: req.userId });
    if (!room) return res.status(404).json({ message: "Room not found" });

    room.pinnedMessage = messageId || null;
    await room.save();

    const pinnedMsg = messageId
      ? await Message.findById(messageId).populate("sender", "username")
      : null;

    res.json({ pinnedMessage: pinnedMsg });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { searchUsers, createOrGetDirectRoom, createGroupRoom, pinMessage };