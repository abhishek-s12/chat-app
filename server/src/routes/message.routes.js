const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getMessages,
  searchMessages,
  getConversations,
  editMessage,
  deleteMessage,
} = require("../controllers/message.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/conversations", getConversations);
router.get("/messages/:roomId", getMessages);
router.get("/messages/:roomId/search", searchMessages);
router.patch("/messages/:messageId", editMessage);
router.delete("/messages/:messageId", deleteMessage);

module.exports = router;
