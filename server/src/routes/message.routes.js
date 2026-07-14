const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getMessages, getConversations } = require("../controllers/message.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/conversations", getConversations);
router.get("/messages/:roomId", getMessages);

module.exports = router;
