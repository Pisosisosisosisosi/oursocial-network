const { getDB } = require('./db');

async function saveMessage(message) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const result = await db.collection('messages').insertOne({
    ...message,
    createdAt: new Date(),
  });

  return result.insertedId;
}

async function getMessages(chatId, limit = 50) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  return db.collection('messages')
    .find({ chatId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

module.exports = { saveMessage, getMessages };