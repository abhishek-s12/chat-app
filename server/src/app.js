const path = require("path");
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth.routes");
const messageRoutes = require("./routes/message.routes");
const roomRoutes = require("./routes/room.routes");
const userRoutes = require("./routes/user.routes");
const uploadRoutes = require("./routes/upload.routes");


const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

// Serve uploaded images statically
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api", messageRoutes); // /api/conversations, /api/messages/:roomId
app.use("/api", roomRoutes);
app.use("/api", userRoutes);
app.use("/api", uploadRoutes);
module.exports = app;
