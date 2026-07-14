const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getLinkPreviewData } = require("../controllers/preview.controller");

const router = express.Router();

router.use(authMiddleware);
router.get("/link-preview", getLinkPreviewData);

module.exports = router;
