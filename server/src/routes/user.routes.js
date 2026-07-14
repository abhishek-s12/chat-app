const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/User");

const bcrypt = require("bcryptjs");

const router = express.Router();
router.use(authMiddleware);

router.post("/users/push-token", async (req, res) => {
  await User.findByIdAndUpdate(req.userId, { pushToken: req.body.pushToken });
  res.json({ success: true });
});

router.post("/users/profile", async (req, res) => {
  const { username, avatar, password } = req.body;
  try {
    const updateData = {};
    if (username) {
      const existing = await User.findOne({ username, _id: { $ne: req.userId } });
      if (existing) {
        return res.status(400).json({ message: "Username is already taken" });
      }
      updateData.username = username;
    }
    if (avatar !== undefined) {
      updateData.avatar = avatar;
    }
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const user = await User.findByIdAndUpdate(req.userId, updateData, { new: true })
      .select("-password");

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;