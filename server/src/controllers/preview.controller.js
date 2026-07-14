const { getLinkPreview } = require("link-preview-js");

// Simple in-memory cache to avoid re-scraping the same URLs
const previewCache = new Map();

// GET /api/link-preview?url=https://github.com
const getLinkPreviewData = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ message: "url query param required" });

    // Return from cache if available
    if (previewCache.has(url)) {
      return res.json(previewCache.get(url));
    }

    const data = await getLinkPreview(url, {
      timeout: 5000,
      followRedirects: "follow",
      handleRedirects: (baseURL, forwardedURL) => {
        return true;
      },
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ChatApp/1.0)",
      },
    });

    const preview = {
      url: data.url,
      title: data.title || "",
      description: data.description || "",
      image: (data.images && data.images[0]) || data.favicons?.[0] || "",
      siteName: data.siteName || "",
    };

    // Cache for 10 minutes
    previewCache.set(url, preview);
    setTimeout(() => previewCache.delete(url), 10 * 60 * 1000);

    res.json(preview);
  } catch (err) {
    // Return a graceful empty response instead of a 500 so the client just hides the preview card
    res.json({ url: req.query.url, title: "", description: "", image: "" });
  }
};

module.exports = { getLinkPreviewData };
