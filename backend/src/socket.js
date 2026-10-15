const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { saveMessage } = require('./services/messages');

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
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('No token provided'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId}`);

    // Каждый пользователь заходит в свой личный room
    socket.join(`user:${socket.userId}`);

    // Присоединиться к чату
    socket.on('join_chat', ({ chatId }) => {
      if (!chatId) return;
      socket.join(`chat:${chatId}`);
      console.log(`User ${socket.userId} joined chat ${chatId}`);
    });

    // Выйти из чата
    socket.on('leave_chat', ({ chatId }) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
      console.log(`User ${socket.userId} left chat ${chatId}`);
    });

    // Отправка сообщения
    socket.on('send_message', async (data, callback) => {
      try {
        const {
          chatId,
          encryptedText,
          type = 'text',
          giftId = null,
        } = data || {};

        if (!chatId || !encryptedText) {
          if (callback) callback({ status: 'error', error: 'chatId and encryptedText required' });
          return;
        }

        const message = {
          chatId,
          senderId: socket.userId,
          senderName: socket.username,
          encryptedText,
          type,
          giftId,
          createdAt: new Date(),
        };

        // Сохранить в MongoDB
        const messageId = await saveMessage(message);

        // Отправить всем в чате, включая отправителя
        io.to(`chat:${chatId}`).emit('receive_message', {
          ...message,
          _id: messageId,
        });

        // Подтверждение отправителю
        if (callback) callback({ status: 'ok', messageId });
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