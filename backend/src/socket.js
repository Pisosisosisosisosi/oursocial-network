const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { saveMessage } = require('./services/messages');
const { getChatById, markChatAsRead } = require('./services/chats');

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // JWT-аутентификация при подключении
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('No token provided'));
    }

    try {
      const secret = process.env.JWT_SECRET || 'secret';
      const decoded = jwt.verify(token, secret);
      socket.userId = String(decoded.userId || decoded.id || decoded._id);
      socket.username = decoded.username || decoded.name || 'Anonymous';
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.username})`);

    // Каждый пользователь заходит в свой личный room для персональных событий (новые чаты, обновления)
    socket.join(`user:${socket.userId}`);

    // Присоединиться к комнате чата
    socket.on('join_chat', ({ chatId }) => {
      if (!chatId) return;
      socket.join(`chat:${chatId}`);
      console.log(`User ${socket.userId} joined chat ${chatId}`);
    });

    // Выйти из комнаты чата
    socket.on('leave_chat', ({ chatId }) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
      console.log(`User ${socket.userId} left chat ${chatId}`);
    });

    // Отправка сообщения в реальном времени
    socket.on('send_message', async (data, callback) => {
      try {
        const {
          chatId,
          encryptedText,
          text,
          type = 'text',
          giftId = null,
          replyTo = null,
        } = data || {};

        const content = encryptedText || text;
        if (!chatId || (!content && content !== '')) {
          if (callback) callback({ status: 'error', error: 'chatId and encryptedText/text required' });
          return;
        }

        // Проверяем членство в чате
        const chat = await getChatById(chatId);
        if (!chat) {
          if (callback) callback({ status: 'error', error: 'Chat not found' });
          return;
        }

        const isMember = (chat.participants || []).map(String).includes(socket.userId);
        if (!isMember) {
          if (callback) callback({ status: 'error', error: 'Access denied: not a member of this chat' });
          return;
        }

        const messageData = {
          chatId: String(chatId),
          senderId: socket.userId,
          senderName: socket.username,
          encryptedText: String(content),
          type,
          giftId,
          replyTo,
          createdAt: new Date(),
        };

        // Сохранить в MongoDB и обновить lastMessage/unreadCounts
        const savedMessage = await saveMessage(messageData);

        // Отправить всем в комнате чата, включая отправителя
        io.to(`chat:${chatId}`).emit('receive_message', savedMessage);

        // Оповестить участников об обновлении списка чатов
        (chat.participants || []).forEach((pId) => {
          io.to(`user:${pId}`).emit('chat_updated', {
            chatId: String(chatId),
            lastMessage: savedMessage,
            updatedAt: savedMessage.createdAt,
          });
        });

        // Подтверждение отправителю
        if (callback) callback({ status: 'ok', messageId: savedMessage._id, message: savedMessage });
      } catch (err) {
        console.error('❌ send_message error:', err);
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

    // Индикатор "печатает..."
    socket.on('typing', ({ chatId }) => {
      if (!chatId) return;
      socket.to(`chat:${chatId}`).emit('user_typing', {
        userId: socket.userId,
        username: socket.username,
        chatId,
      });
    });

    // Отметка чата как прочитанного
    socket.on('mark_as_read', async ({ chatId }, callback) => {
      try {
        if (!chatId) return;
        await markChatAsRead(chatId, socket.userId);

        io.to(`chat:${chatId}`).emit('messages_read', {
          chatId,
          userId: socket.userId,
        });

        io.to(`user:${socket.userId}`).emit('unread_updated', {
          chatId,
          unreadCount: 0,
        });

        if (callback) callback({ status: 'ok', chatId });
      } catch (err) {
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

    // Отключение
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

module.exports = { initSocket, getIO };