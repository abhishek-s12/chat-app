import { getItem, setItem } from "./storage";

const DEFAULT_SERVER_URL = "http://192.168.1.6:5000"; // default LAN IP fallback

const STORAGE_KEY = "server_url";

/**
 * Retrieves the stored server URL, or the default if not yet configured.
 */
export async function getServerUrl() {
  const saved = await getItem(STORAGE_KEY);
  return saved || DEFAULT_SERVER_URL;
}

/**
 * Persists a new server URL to device storage.
 */
export async function saveServerUrl(url) {
  const trimmed = url.trim().replace(/\/+$/, ""); // strip trailing slashes
  await setItem(STORAGE_KEY, trimmed);
}
