const { getDB } = require('./db');
const { ObjectId } = require('mongodb');

async function saveMessage(message) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const result = await db.collection('messages').insertOne({
    ...message,
    readBy: [message.senderId],
    deliveredTo: [message.senderId],
    deleted: false,
    createdAt: new Date(),
  });

  return result.insertedId;
}

async function getMessages(chatId, limit = 50) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  return db.collection('messages')
    .find({ chatId, deleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}

async function markAsRead(messageId, userId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const result = await db.collection('messages').updateOne(
    { _id: new ObjectId(messageId) },
    { $addToSet: { readBy: userId } }
  );

  return result.modifiedCount > 0;
}

async function markAsDelivered(messageId, userId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const result = await db.collection('messages').updateOne(
    { _id: new ObjectId(messageId) },
    { $addToSet: { deliveredTo: userId } }
  );

  return result.modifiedCount > 0;
}

async function deleteMessage(messageId, userId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const result = await db.collection('messages').updateOne(
    { _id: new ObjectId(messageId), senderId: userId },
    { $set: { deleted: true, deletedAt: new Date() } }
  );

  return result.modifiedCount > 0;
}

async function getUnreadCount(chatId, userId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  return db.collection('messages').countDocuments({
    chatId,
    deleted: { $ne: true },
    senderId: { $ne: userId },
    readBy: { $ne: userId },
  });
}

module.exports = {
  saveMessage,
  getMessages,
  markAsRead,
  markAsDelivered,
  deleteMessage,
  getUnreadCount,
};