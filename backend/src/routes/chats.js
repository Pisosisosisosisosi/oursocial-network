const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getUserChats, createChat, getChatById } = require('../services/chats');
const messagesRoutes = require('./messages');

// Защита всех эндпоинтов чатов через JWT-аутентификацию
router.use(authMiddleware);

/**
 * GET /api/chats
 * Получить список всех чатов текущего авторизованного пользователя
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id || req.user._id;
    const chats = await getUserChats(userId);

    res.status(200).json({
      status: 'ok',
      count: chats.length,
      chats,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/chats
 * Создать чат с { participantId }
 */
router.post('/', async (req, res, next) => {
  try {
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({ error: 'participantId is required' });
    }

    const userId = req.user.userId || req.user.id || req.user._id;

    if (String(participantId) === String(userId)) {
      return res.status(400).json({ error: 'Cannot create chat with yourself' });
    }

    const chat = await createChat(userId, participantId);

    res.status(201).json({
      status: 'ok',
      chat,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/chats/:id
 * Получить конкретный чат по ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const chat = await getChatById(req.params.id);

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const userId = String(req.user.userId || req.user.id || req.user._id);
    const isMember = chat.participants && chat.participants.map(String).includes(userId);

    if (!isMember) {
      return res.status(403).json({ error: 'Access denied: You are not a member of this chat' });
    }

    res.status(200).json({
      status: 'ok',
      chat,
    });
  } catch (err) {
    next(err);
  }
});

// Перенаправление маршрутов сообщений внутри чата: /api/chats/:id/messages
router.use('/:id/messages', (req, res, next) => {
  req.chatId = req.params.id;
  next();
}, messagesRoutes);

module.exports = router;
