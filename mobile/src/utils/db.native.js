import * as SQLite from "expo-sqlite";

let _db = null;

async function getDB() {
  if (_db) return _db;

  _db = await SQLite.openDatabaseAsync("chat.db");

  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      _id TEXT PRIMARY KEY,
      roomId TEXT NOT NULL,
      senderId TEXT,
      senderUsername TEXT,
      senderAvatar TEXT,
      content TEXT,
      type TEXT DEFAULT 'text',
      status TEXT DEFAULT 'sent',
      isEdited INTEGER DEFAULT 0,
      isDeleted INTEGER DEFAULT 0,
      replyToId TEXT,
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_messages_room ON messages (roomId, createdAt);

    CREATE TABLE IF NOT EXISTS queued_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      roomId TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      replyToId TEXT,
      createdAt TEXT
    );
  `);

  return _db;
}

export async function cacheMessages(messages) {
  const db = await getDB();
  await db.withTransactionAsync(async () => {
    for (const m of messages) {
      await db.runAsync(
        `INSERT OR REPLACE INTO messages
          (_id, roomId, senderId, senderUsername, senderAvatar, content, type, status, isEdited, isDeleted, replyToId, createdAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m._id,
          m.room,
          m.sender?._id || "",
          m.sender?.username || "",
          m.sender?.avatar || "",
          m.content,
          m.type || "text",
          m.status || "sent",
          m.isEdited ? 1 : 0,
          m.isDeleted ? 1 : 0,
          m.replyTo?._id || null,
          m.createdAt,
        ]
      );
    }
  });
}

export async function loadCachedMessages(roomId) {
  const db = await getDB();
  const rows = await db.getAllAsync(
    `SELECT * FROM messages WHERE roomId = ? ORDER BY createdAt ASC`,
    [roomId]
  );
  return rows.map((r) => ({
    _id: r._id,
    room: r.roomId,
    sender: { _id: r.senderId, username: r.senderUsername, avatar: r.senderAvatar },
    content: r.content,
    type: r.type,
    status: r.status,
    isEdited: r.isEdited === 1,
    isDeleted: r.isDeleted === 1,
    replyTo: r.replyToId ? { _id: r.replyToId } : null,
    createdAt: r.createdAt,
  }));
}

export async function updateCachedMessage(messageId, fields) {
  const db = await getDB();
  const sets = Object.keys(fields).map((k) => `${k} = ?`).join(", ");
  const values = [...Object.values(fields), messageId];
  await db.runAsync(`UPDATE messages SET ${sets} WHERE _id = ?`, values);
}

export async function queueMessage({ roomId, content, type = "text", replyToId }) {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO queued_messages (roomId, content, type, replyToId, createdAt) VALUES (?, ?, ?, ?, ?)`,
    [roomId, content, type, replyToId || null, new Date().toISOString()]
  );
}

export async function getQueuedMessages() {
  const db = await getDB();
  return db.getAllAsync(`SELECT * FROM queued_messages ORDER BY id ASC`);
}

export async function removeQueuedMessage(id) {
  const db = await getDB();
  await db.runAsync(`DELETE FROM queued_messages WHERE id = ?`, [id]);
}
