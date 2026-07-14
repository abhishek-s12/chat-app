const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");

const router = express.Router();
router.use(authMiddleware);

router.post("/users/push-token", async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { pushToken: req.body.pushToken });
  res.json({ success: true });
});

module.exports = router;