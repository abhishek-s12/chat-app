const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { searchUsers, createOrGetDirectRoom, createGroupRoom } = require("../controllers/room.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/users/search", searchUsers);
router.post("/rooms", createOrGetDirectRoom);
router.post("/rooms/group", createGroupRoom);

module.exports = router;