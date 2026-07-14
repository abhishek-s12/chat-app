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

const storage = multer.memoryStorage();

const imageUpload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (/image\/(jpeg|jpg|png|gif|webp)/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only image files are allowed!"));
  },
});

const audioUpload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (/audio\/(mpeg|mp4|m4a|wav|ogg|webm|aac)|video\/(mp4|webm)/.test(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only audio files are allowed!"));
  },
});

router.use(authMiddleware);

// Helper: check if Cloudinary is configured
function ensureCloudinaryConfigured(res) {
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    process.env.CLOUDINARY_CLOUD_NAME === "your_cloud_name"
  ) {
    res.status(500).json({
      message:
        "Cloudinary is not configured. Please fill in your credentials in the server .env file.",
    });
    return false;
  }
  return true;
}

// POST /api/upload  (images)
router.post("/upload", imageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!ensureCloudinaryConfigured(res)) return;

  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: "chat_app_uploads" },
    (error, result) => {
      if (error) return res.status(500).json({ message: "Upload failed", error: error.message });
      res.status(200).json({ url: result.secure_url });
    }
  );
  uploadStream.end(req.file.buffer);
});

// POST /api/upload-audio  (voice messages)
router.post("/upload-audio", audioUpload.single("audio"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  if (!ensureCloudinaryConfigured(res)) return;

  const uploadStream = cloudinary.uploader.upload_stream(
    { folder: "chat_app_audio", resource_type: "video" }, // Cloudinary uses "video" for audio
    (error, result) => {
      if (error) return res.status(500).json({ message: "Audio upload failed", error: error.message });
      res.status(200).json({ url: result.secure_url });
    }
  );
  uploadStream.end(req.file.buffer);
});

module.exports = router;
