const { getDB } = require('./db');
const { ObjectId } = require('mongodb');
const { updateLastMessage, recalculateLastMessage, toObjectId } = require('./chats');

/**
 * Сохранить новое сообщение в базе данных и обновить статус чата
 * @param {object} messageData - { chatId, senderId, senderName, encryptedText, type, giftId, replyTo }
 * @returns {Promise<object>} сохраненное сообщение с _id
 */
async function saveMessage(messageData) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const {
    chatId,
    senderId,
    senderName,
    encryptedText,
    type = 'text',
    giftId = null,
    replyTo = null,
  } = messageData;

  if (!chatId) throw new Error('chatId is required');
  if (!senderId) throw new Error('senderId is required');
  if (!encryptedText && encryptedText !== '') {
    throw new Error('encryptedText or text is required');
  }

  const senderIdStr = String(senderId);
  const chatIdStr = String(chatId);

  const newDoc = {
    chatId: chatIdStr,
    senderId: senderIdStr,
    senderName: senderName || 'Anonymous',
    encryptedText: String(encryptedText),
    type: type || 'text',
    giftId: giftId ? String(giftId) : null,
    replyTo: replyTo ? String(replyTo) : null,
    readBy: [senderIdStr],
    isEdited: false,
    createdAt: messageData.createdAt ? new Date(messageData.createdAt) : new Date(),
  };

  const result = await db.collection('messages').insertOne(newDoc);
  const savedMessage = {
    _id: String(result.insertedId),
    ...newDoc,
  };

  // Обновляем последнее сообщение и счетчик непрочитанных в документе чата
  await updateLastMessage(chatIdStr, savedMessage);

  return savedMessage;
}

/**
 * Получить историю сообщений для чата с поддержкой пагинации и курсоров
 * @param {string} chatId
 * @param {object} options - { limit, before, after, skip, order }
 * @returns {Promise<Array>} список сообщений
 */
async function getMessages(chatId, options = {}) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const chatIdStr = String(chatId);
  const objId = toObjectId(chatId);

  const query = {
    $or: [{ chatId: chatIdStr }, { chatId: objId }],
  };

  // Курсорная пагинация (скролл назад во времени)
  if (options.before) {
    const beforeDate = new Date(options.before);
    if (!isNaN(beforeDate.getTime())) {
      query.createdAt = { $lt: beforeDate };
    } else {
      const beforeObjId = toObjectId(options.before);
      if (beforeObjId) {
        query._id = { $lt: beforeObjId };
      }
    }
  }

  // Курсорная пагинация (новые сообщения вперед)
  if (options.after) {
    const afterDate = new Date(options.after);
    if (!isNaN(afterDate.getTime())) {
      query.createdAt = { $gt: afterDate };
    }
  }

  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const skip = Math.max(parseInt(options.skip || options.offset, 10) || 0, 0);
  const order = options.order === 'desc' ? 'desc' : 'asc';

  // Выбираем самые свежие сообщения
  const rawMessages = await db
    .collection('messages')
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const formattedMessages = rawMessages.map((m) => ({
    ...m,
    _id: String(m._id),
    chatId: String(m.chatId),
    senderId: String(m.senderId),
  }));

  // Для фронтенда мессенджера порядок по умолчанию — хронологический (старые -> новые)
  if (order === 'asc') {
    formattedMessages.reverse();
  }

  return formattedMessages;
}

/**
 * Получить конкретное сообщение по ID
 * @param {string} messageId
 * @returns {Promise<object|null>}
 */
async function getMessageById(messageId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const objId = toObjectId(messageId);
  const message = await db.collection('messages').findOne({
    $or: [{ _id: objId }, { _id: String(messageId) }],
  });

  if (!message) return null;

  return {
    ...message,
    _id: String(message._id),
    chatId: String(message.chatId),
    senderId: String(message.senderId),
  };
}

/**
 * Отредактировать текст сообщения
 * @param {string} messageId
 * @param {string} userId - ID запрашивающего (должен быть автором)
 * @param {string} newText
 * @returns {Promise<object>} обновленное сообщение
 */
async function updateMessage(messageId, userId, newText) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const message = await getMessageById(messageId);
  if (!message) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  if (String(message.senderId) !== String(userId)) {
    const err = new Error('Access denied: You can only edit your own messages');
    err.status = 403;
    throw err;
  }

  const objId = toObjectId(messageId);
  const now = new Date();

  await db.collection('messages').updateOne(
    { $or: [{ _id: objId }, { _id: String(messageId) }] },
    {
      $set: {
        encryptedText: String(newText),
        isEdited: true,
        editedAt: now,
      },
    }
  );

  const updatedMessage = await getMessageById(messageId);

  // Проверяем, было ли это сообщение последним в чате — если да, обновляем превью в чате
  try {
    const chat = await db.collection('chats').findOne({
      $or: [{ _id: toObjectId(message.chatId) }, { _id: String(message.chatId) }],
    });
    if (chat && chat.lastMessage && String(chat.lastMessage.messageId) === String(messageId)) {
      await db.collection('chats').updateOne(
        { _id: chat._id },
        {
          $set: {
            'lastMessage.encryptedText': String(newText),
            'lastMessage.isEdited': true,
          },
        }
      );
    }
  } catch (e) {
    console.error('Failed to update chat lastMessage on edit:', e.message);
  }

  return updatedMessage;
}

/**
 * Удалить сообщение
 * @param {string} messageId
 * @param {string} userId
 * @param {boolean} isChatAdmin
 */
async function deleteMessage(messageId, userId, isChatAdmin = false) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const message = await getMessageById(messageId);
  if (!message) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  const isAuthor = String(message.senderId) === String(userId);
  if (!isAuthor && !isChatAdmin) {
    const err = new Error('Access denied: You can only delete your own messages or be a chat admin');
    err.status = 403;
    throw err;
  }

  const objId = toObjectId(messageId);
  await db.collection('messages').deleteOne({
    $or: [{ _id: objId }, { _id: String(messageId) }],
  });

  // Пересчитываем lastMessage в чате
  await recalculateLastMessage(message.chatId);

  return { success: true, messageId: String(messageId), chatId: String(message.chatId) };
}

/**
 * Пометить сообщения в чате прочитанными пользователем
 * @param {string} chatId
 * @param {string} userId
 */
async function markMessagesAsRead(chatId, userId) {
  const db = getDB();
  if (!db) throw new Error('DB not connected');

  const userIdStr = String(userId);
  const objId = toObjectId(chatId);

  await db.collection('messages').updateMany(
    {
      $or: [{ chatId: String(chatId) }, { chatId: objId }],
      readBy: { $ne: userIdStr },
    },
    {
      $addToSet: { readBy: userIdStr },
    }
  );

  return { success: true, chatId: String(chatId), userId: userIdStr };
}

module.exports = {
  saveMessage,
  getMessages,
  getMessageById,
  updateMessage,
  deleteMessage,
  markMessagesAsRead,
};