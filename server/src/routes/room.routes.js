const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { searchUsers, createOrGetDirectRoom, createGroupRoom, pinMessage } = require("../controllers/room.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/users/search", searchUsers);
router.post("/rooms", createOrGetDirectRoom);
router.post("/rooms/group", createGroupRoom);
router.patch("/rooms/:roomId/pin", pinMessage);

module.exports = router;