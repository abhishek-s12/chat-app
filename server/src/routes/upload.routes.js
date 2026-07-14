const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Configure Cloudinary credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Store uploaded files in RAM memory as a Buffer
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // limit 10MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images are allowed (jpeg, jpg, png, gif, webp)!"));
  },
});

router.use(authMiddleware);

router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  // Check if Cloudinary is configured
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME === "your_cloud_name"
  ) {
    return res.status(500).json({
      message: "Cloudinary is not configured. Please fill in your credentials in the server .env file.",
    });
  }

  // Create stream to upload directly to Cloudinary
  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: "chat_app_uploads" },
    (error, result) => {
      if (error) {
        return res.status(500).json({ message: "Cloudinary upload failed", error: error.message });
      }
      res.status(200).json({ url: result.secure_url });
    }
  );

  // Pipe the buffer
  uploadStream.end(req.file.buffer);
});

module.exports = router;
