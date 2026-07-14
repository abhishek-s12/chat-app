const Room = require("../models/Room");
const User = require("../models/User");

// GET /api/users/search?query=john
const searchUsers = async (req, res) => {
  const { query } = req.query;
  const users = await User.find({
    username: { $regex: query, $options: "i" },
    _id: { $ne: req.userId },
  }).select("username avatar isOnline").limit(20);
  res.json({ users });
};

// POST /api/rooms  { participantId }  -> creates or returns existing direct room
const createOrGetDirectRoom = async (req, res) => {
  const { participantId } = req.body;
  if (!participantId) return res.status(400).json({ message: "participantId required" });

  let room = await Room.findOne({
    type: "direct",
    participants: { $all: [req.userId, participantId], $size: 2 },
  }).populate("participants", "username avatar isOnline");

  if (!room) {
    room = await Room.create({
      type: "direct",
      participants: [req.userId, participantId],
    });
    room = await room.populate("participants", "username avatar isOnline");
  }

  res.status(201).json({ room });
};

// POST /api/rooms/group  { participantIds, name } -> creates a group room
const createGroupRoom = async (req, res) => {
  const { participantIds, name } = req.body;
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    return res.status(400).json({ message: "participantIds array is required" });
  }

  // Ensure current user is in the room and participants are unique
  const uniqueParticipants = [...new Set([...participantIds, req.userId])];

  try {
    let room = await Room.create({
      type: "group",
      name: name || "Group Chat",
      participants: uniqueParticipants,
    });
    room = await room.populate("participants", "username avatar isOnline");
    res.status(201).json({ room });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { searchUsers, createOrGetDirectRoom, createGroupRoom };