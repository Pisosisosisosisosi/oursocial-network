const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../middleware/auth');
const {
  getMessages,
  saveMessage,
  getMessageById,
  updateMessage,
  deleteMessage,
  markMessagesAsRead,
} = require('../services/messages');
const { getChatById, markChatAsRead } = require('../services/chats');

// Защита всех эндпоинтов сообщений через JWT-аутентификацию
router.use(authMiddleware);

/**
 * Хелпер для извлечения ID текущего пользователя из req.user
 */
function getReqUserId(req) {
  return String(req.user.userId || req.user.id || req.user._id);
}

/**
 * Безопасное получение инстанса Socket.IO (если инициализирован)
 */
function getSocketIO() {
  try {
    const { getIO } = require('../socket');
    return getIO();
  } catch (e) {
    return null;
  }
}

/**
 * Проверка принадлежности пользователя к чату
 */
async function verifyChatMembership(chatId, userId) {
  const chat = await getChatById(chatId);
  if (!chat) {
    const err = new Error('Chat not found');
    err.status = 404;
    throw err;
  }

  const userIdStr = String(userId);
  const isMember = (chat.participants || []).map(String).includes(userIdStr);
  if (!isMember) {
    const err = new Error('Access denied: You are not a member of this chat');
    err.status = 403;
    throw err;
  }

  return chat;
}

/**
 * GET /api/chats/:id/messages (или /api/messages/:chatId)
 * Получение истории сообщений чата
 * Query параметры:
 * - limit: количество сообщений (по умолчанию 50)
 * - before: курсор (ISO дата или ObjectId) для загрузки более старых сообщений
 * - after: курсор для загрузки более новых сообщений
 * - skip: смещение
 * - order: asc (по умолчанию, от старых к новым) или desc (новые сначала)
 */
async function getChatMessagesHandler(req, res, next) {
  try {
    const chatId = req.chatId || req.params.id || req.params.chatId || req.query.chatId;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const userId = getReqUserId(req);

    // Проверяем, что пользователь состоит в чате
    await verifyChatMembership(chatId, userId);

    const options = {
      limit: req.query.limit,
      before: req.query.before,
      after: req.query.after,
      skip: req.query.skip || req.query.offset,
      order: req.query.order || 'asc',
    };

    const messages = await getMessages(String(chatId), options);

    res.status(200).json({
      status: 'ok',
      chatId: String(chatId),
      count: messages.length,
      messages,
    });
  } catch (err) {
    next(err);
  }
}

router.get('/', getChatMessagesHandler);
router.get('/:chatId', getChatMessagesHandler);

/**
 * POST /api/chats/:id/messages (или /api/messages/:chatId)
 * REST отправка сообщения в чат (с полным сохранением и сокет-оповещением)
 */
async function postMessageHandler(req, res, next) {
  try {
    const chatId = req.chatId || req.params.id || req.params.chatId || req.body.chatId;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const userId = getReqUserId(req);

    // Проверяем членство в чате
    const chat = await verifyChatMembership(chatId, userId);

    const encryptedText =
      req.body.encryptedText || req.body.text || req.body.content || req.body.message;

    if (!encryptedText && encryptedText !== '') {
      return res.status(400).json({ error: 'encryptedText or text is required' });
    }

    const type = req.body.type || 'text';
    const giftId = req.body.giftId || null;
    const replyTo = req.body.replyTo || null;
    const senderName = req.user.username || req.user.name || 'Anonymous';

    const messageData = {
      chatId: String(chatId),
      senderId: String(userId),
      senderName,
      encryptedText: String(encryptedText),
      type,
      giftId,
      replyTo,
    };

    // Сохраняем сообщение и обновляем lastMessage чата
    const savedMessage = await saveMessage(messageData);

    // Оповещаем участников через Socket.IO в реальном времени
    const io = getSocketIO();
    if (io) {
      // Отправляем в комнату чата
      io.to(`chat:${chatId}`).emit('receive_message', savedMessage);

      // Отправляем обновление чата каждому участнику в его персональную комнату
      (chat.participants || []).forEach((pId) => {
        io.to(`user:${pId}`).emit('chat_updated', {
          chatId: String(chatId),
          lastMessage: savedMessage,
          updatedAt: savedMessage.createdAt,
        });
      });
    }

    res.status(201).json({
      status: 'ok',
      messageId: savedMessage._id,
      message: savedMessage,
    });
  } catch (err) {
    next(err);
  }
}

router.post('/', postMessageHandler);
router.post('/:chatId', postMessageHandler);

/**
 * PATCH /api/chats/:id/messages/:messageId (или /api/messages/:messageId)
 * Редактирование текста отправленного сообщения
 */
router.patch('/:messageId', async (req, res, next) => {
  try {
    const messageId = req.params.messageId;
    const userId = getReqUserId(req);
    const newText = req.body.encryptedText || req.body.text || req.body.content;

    if (!newText && newText !== '') {
      return res.status(400).json({ error: 'encryptedText or text is required' });
    }

    const updated = await updateMessage(messageId, userId, newText);

    const io = getSocketIO();
    if (io) {
      io.to(`chat:${updated.chatId}`).emit('message_edited', updated);
    }

    res.status(200).json({
      status: 'ok',
      message: updated,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/chats/:id/messages/:messageId (или /api/messages/:messageId)
 * Удаление сообщения
 */
router.delete('/:messageId', async (req, res, next) => {
  try {
    const messageId = req.params.messageId;
    const userId = getReqUserId(req);

    const existing = await getMessageById(messageId);
    if (!existing) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Проверяем, является ли пользователь автором сообщения или админом чата
    const chat = await getChatById(existing.chatId);
    const admins = (chat && chat.admins) ? chat.admins.map(String) : [];
    const isChatAdmin = admins.includes(userId) || (chat && String(chat.creatorId) === userId);

    const result = await deleteMessage(messageId, userId, isChatAdmin);

    const io = getSocketIO();
    if (io) {
      io.to(`chat:${existing.chatId}`).emit('message_deleted', {
        messageId,
        chatId: existing.chatId,
      });
    }

    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /read (или /api/chats/:id/messages/read)
 * Пометить сообщения чата прочитанными
 */
router.post('/read', async (req, res, next) => {
  try {
    const chatId = req.chatId || req.params.id || req.body.chatId;
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const userId = getReqUserId(req);
    await verifyChatMembership(chatId, userId);

    const result = await markChatAsRead(chatId, userId);

    const io = getSocketIO();
    if (io) {
      io.to(`chat:${chatId}`).emit('messages_read', {
        chatId,
        userId,
      });
      io.to(`user:${userId}`).emit('unread_updated', {
        chatId,
        unreadCount: 0,
      });
    }

    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
