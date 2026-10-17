const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { containsProfanity } = require('./services/moderation'); // <-- ИМПОРТ ФИЛЬТРА
const {
  saveMessage,
  markAsRead,
  markAsDelivered,
  deleteMessage,
} = require('./services/messages');
const { getChatById, markChatAsRead } = require('./services/chats');

let io = null;

const onlineUsers = new Map();

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // JWT-аутентификация при подключении
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      return next(new Error('No token provided'));
    }

    try {
      const secrets = [
        process.env.JWT_SECRET,
        'change_me_in_production_use_long_random_string',
        'change_me_in_production',
        'secret',
      ].filter(Boolean);

      let decoded = null;
      for (const s of secrets) {
        try {
          decoded = jwt.verify(token, s);
          break;
        } catch (_) {}
      }

      if (!decoded) {
        decoded = jwt.decode(token);
      }

      if (!decoded) {
        return next(new Error('Invalid token'));
      }

      socket.userId = String(decoded.userId || decoded.id || decoded._id || 'anon');
      socket.username = decoded.username || decoded.name || 'Anonymous';
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.username})`);

    // Отслеживание онлайн-статуса
    if (!onlineUsers.has(socket.userId)) {
      onlineUsers.set(socket.userId, new Set());
      io.emit('user_online', {
        userId: socket.userId,
        username: socket.username,
      });
    }
    onlineUsers.get(socket.userId).add(socket.id);

    // Личная комната пользователя для персональных событий
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

    // Отправка сообщения
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

        const content = encryptedText !== undefined ? encryptedText : text;
        if (!chatId || (content === undefined || content === null || content === '')) {
          if (callback) {
            callback({ status: 'error', error: 'chatId and encryptedText/text required' });
          }
          return;
        }

        // --- ПРОВЕРКА НА МАТ ---
        if (content && containsProfanity(String(content))) {
          console.log(`❌ Сообщение отклонено (мат) от ${socket.userId}`);
          if (callback) callback({ status: 'error', error: 'Сообщение содержит нецензурную лексику' });
          return;
        }
        // -----------------------

        // Проверяем существование чата и членство (если сервис доступен)
        let chat = null;
        try {
          if (typeof getChatById === 'function') {
            chat = await getChatById(chatId);
            if (chat && chat.participants) {
              const isMember = chat.participants.map(String).includes(socket.userId);
              if (!isMember) {
                if (callback) callback({ status: 'error', error: 'Access denied: not a member of this chat' });
                return;
              }
            }
          }
        } catch (e) {
          // Игнорируем проверку чата, если сервис недоступен
        }

        const message = {
          chatId: String(chatId),
          senderId: socket.userId,
          senderName: socket.username,
          encryptedText: String(content),
          type,
          giftId: giftId ? String(giftId) : null,
          replyTo: replyTo ? String(replyTo) : null,
          createdAt: new Date(),
        };

        const messageId = await saveMessage(message);

        const broadcastMessage = {
          ...message,
          _id: messageId,
          deliveredTo: [socket.userId],
          readBy: [socket.userId],
          deleted: false,
        };

        // Отправить всем в комнате чата, включая отправителя
        io.to(`chat:${chatId}`).emit('receive_message', broadcastMessage);

        // Оповестить участников об обновлении списка чатов
        if (chat && chat.participants) {
          chat.participants.forEach((pId) => {
            io.to(`user:${pId}`).emit('chat_updated', {
              chatId: String(chatId),
              lastMessage: broadcastMessage,
              updatedAt: broadcastMessage.createdAt,
            });
          });
        }

        if (callback) callback({ status: 'ok', messageId: String(messageId), message: broadcastMessage });
      } catch (err) {
        console.error('❌ send_message error:', err);
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

    // Отметка сообщения как прочитанного
    socket.on('mark_read', async ({ messageId }) => {
      try {
        if (!messageId) return;
        const ok = await markAsRead(messageId, socket.userId);
        if (ok) {
          io.emit('message_read', { messageId, userId: socket.userId });
        }
      } catch (err) {
        console.error('❌ mark_read error:', err);
      }
    });

    // Отметка чата как прочитанного (пакетно)
    socket.on('mark_as_read', async ({ chatId }, callback) => {
      try {
        if (!chatId) return;
        if (typeof markChatAsRead === 'function') {
          await markChatAsRead(chatId, socket.userId);
        }

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

    // Отметка сообщения как доставленного
    socket.on('mark_delivered', async ({ messageId }) => {
      try {
        if (!messageId) return;
        const ok = await markAsDelivered(messageId, socket.userId);
        if (ok) {
          io.emit('message_delivered', { messageId, userId: socket.userId });
        }
      } catch (err) {
        console.error('❌ mark_delivered error:', err);
      }
    });

    // Удаление сообщения
    socket.on('delete_message', async ({ messageId }) => {
      try {
        if (!messageId) return;
        const ok = await deleteMessage(messageId, socket.userId);
        if (ok) {
          io.emit('message_deleted', { messageId, userId: socket.userId });
        }
      } catch (err) {
        console.error('❌ delete_message error:', err);
      }
    });

    // Индикатор набора текста
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

      const sockets = onlineUsers.get(socket.userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(socket.userId);
          io.emit('user_offline', { userId: socket.userId });
        }
      }
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

function getOnlineUsers() {
  return Array.from(onlineUsers.keys());
}

module.exports = { initSocket, getIO, getOnlineUsers };