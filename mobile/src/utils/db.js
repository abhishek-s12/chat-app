// Web stub — expo-sqlite is native-only.
// All functions are no-ops that return safe empty values.

export async function cacheMessages(_messages) {}

export async function loadCachedMessages(_roomId) {
  return [];
}

export async function updateCachedMessage(_messageId, _fields) {}

export async function queueMessage(_opts) {}

export async function getQueuedMessages() {
  return [];
}

export async function removeQueuedMessage(_id) {}
