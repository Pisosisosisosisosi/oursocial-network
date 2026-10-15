const express = require('express');
const router = express.Router({ mergeParams: true });
const authMiddleware = require('../middleware/auth');
const { getMessages, saveMessage } = require('../services/messages');
const { updateLastMessage } = require('../services/chats');

// Защита всех эндпоинтов сообщений через JWT-аутентификацию
router.use(authMiddleware);

/**
 * GET /api/chats/:id/messages (или /api/messages/:chatId)
 * Получение истории сообщений
 */
router.get('/', async (req, res, next) => {
  try {
    const chatId = req.chatId || req.params.id || req.params.chatId || req.query.chatId;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const messages = await getMessages(String(chatId), limit);

    res.status(200).json({
      status: 'ok',
      chatId: String(chatId),
      count: messages.length,
      messages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/messages/:chatId (прямой доступ)
 */
router.get('/:chatId', async (req, res, next) => {
  try {
    const chatId = req.params.chatId;
    const limit = parseInt(req.query.limit, 10) || 50;
    const messages = await getMessages(String(chatId), limit);

    res.status(200).json({
      status: 'ok',
      chatId: String(chatId),
      count: messages.length,
      messages,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chats/:id/messages (или /api/messages)
 * REST-fallback для отправки сообщения
 */
router.post('/', async (req, res, next) => {
  try {
    const chatId = req.chatId || req.params.id || req.params.chatId || req.body.chatId;

    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }

    const encryptedText = req.body.encryptedText || req.body.text || req.body.content || req.body.message;
    if (!encryptedText) {
      return res.status(400).json({ error: 'encryptedText or text is required' });
    }

    const type = req.body.type || 'text';
    const giftId = req.body.giftId || null;

    const senderId = req.user.userId || req.user.id || req.user._id;
    const senderName = req.user.username || req.user.name || 'Anonymous';

    const message = {
      chatId: String(chatId),
      senderId: String(senderId),
      senderName,
      encryptedText,
      type,
      giftId,
      createdAt: new Date(),
    };

    // Сохранить в MongoDB через сервис messages
    const messageId = await saveMessage(message);

    // Обновить lastMessage в чате
    await updateLastMessage(chatId, message);

    // Трансляция в комнату чата Socket.IO в реальном времени (если сервер инициализирован)
    try {
      const { getIO } = require('../socket');
      const io = getIO();
      if (io) {
        io.to(`chat:${chatId}`).emit('receive_message', {
          ...message,
          _id: messageId,
        });
      }
    } catch (e) {
      // Игнорируем, если socket.io не подключен
    }

    res.status(201).json({
      status: 'ok',
      messageId,
      message: {
        _id: messageId,
        ...message,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/messages/:chatId (прямой доступ)
 */
router.post('/:chatId', async (req, res, next) => {
  req.chatId = req.params.chatId;
  return router.handle(req, res, next);
});

module.exports = router;
