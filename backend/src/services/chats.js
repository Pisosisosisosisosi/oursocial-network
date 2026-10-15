const { getDB } = require('./db');
const { ObjectId } = require('mongodb');

/**
 * Безопасное преобразование в ObjectId MongoDB
 */
function toObjectId(id) {
  if (!id) return null;
  if (id instanceof ObjectId) return id;
  if (typeof id === 'string' && ObjectId.isValid(id) && id.length === 24) {
    try {
      return new ObjectId(id);
    } catch (e) {
      return id;
    }
  }
  return id;
}

/**
 * Получить список всех чатов конкретного пользователя
 * @param {string} userId - ID пользователя
 * @returns {Promise<Array>} список чатов
 */
async function getUserChats(userId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const idStr = String(userId);

  return db.collection('chats')
    .find({
      $or: [
        { participants: idStr },
        { participants: userId },
      ],
    })
    .sort({ updatedAt: -1, createdAt: -1 })
    .toArray();
}

/**
 * Создать новый чат или вернуть существующий между двумя пользователями
 * @param {string} userId - ID создателя
 * @param {string} participantId - ID собеседника
 * @param {object} extraData - дополнительные поля
 * @returns {Promise<object>} чат
 */
async function createChat(userId, participantId, extraData = {}) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const p1 = String(userId);
  const p2 = String(participantId);

  // Проверяем, существует ли уже прямой чат между ними
  const existingChat = await db.collection('chats').findOne({
    type: 'direct',
    participants: { $all: [p1, p2], $size: 2 },
  });

  if (existingChat) {
    return existingChat;
  }

  const newChat = {
    participants: [p1, p2],
    type: 'direct',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessage: null,
    ...extraData,
  };

  const result = await db.collection('chats').insertOne(newChat);
  return { _id: result.insertedId, ...newChat };
}

/**
 * Найти чат по его идентификатору
 * @param {string} chatId
 * @returns {Promise<object|null>}
 */
async function getChatById(chatId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const objId = toObjectId(chatId);

  return db.collection('chats').findOne({
    $or: [
      { _id: objId },
      { _id: String(chatId) },
    ],
  });
}

/**
 * Обновить информацию о последнем сообщении в чате
 * @param {string} chatId
 * @param {object} message
 */
async function updateLastMessage(chatId, message) {
  try {
    const db = getDB();
    if (!db) return;

    const objId = toObjectId(chatId);

    await db.collection('chats').updateOne(
      {
        $or: [
          { _id: objId },
          { _id: String(chatId) },
        ],
      },
      {
        $set: {
          lastMessage: {
            senderId: String(message.senderId),
            senderName: message.senderName,
            encryptedText: message.encryptedText,
            type: message.type || 'text',
            createdAt: message.createdAt || new Date(),
          },
          updatedAt: new Date(),
        },
      }
    );
  } catch (err) {
    console.error('Failed to update chat lastMessage:', err.message);
  }
}

module.exports = {
  getUserChats,
  createChat,
  getChatById,
  updateLastMessage,
};
