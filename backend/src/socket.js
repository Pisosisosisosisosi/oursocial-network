const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const {
  saveMessage,
  markAsRead,
  markAsDelivered,
  deleteMessage,
} = require('./services/messages');

let io = null;

const onlineUsers = new Map();

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('No token provided'));

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

    if (!onlineUsers.has(socket.userId)) {
      onlineUsers.set(socket.userId, new Set());
      io.emit('user_online', {
        userId: socket.userId,
        username: socket.username,
      });
    }
    onlineUsers.get(socket.userId).add(socket.id);

    socket.join(`user:${socket.userId}`);

    socket.on('join_chat', ({ chatId }) => {
      if (!chatId) return;
      socket.join(`chat:${chatId}`);
      console.log(`User ${socket.userId} joined chat ${chatId}`);
    });

    socket.on('leave_chat', ({ chatId }) => {
      if (!chatId) return;
      socket.leave(`chat:${chatId}`);
    });

    socket.on('send_message', async (data, callback) => {
      try {
        const {
          chatId,
          encryptedText,
          type = 'text',
          giftId = null,
        } = data || {};

        if (!chatId || !encryptedText) {
          if (callback) {
            callback({ status: 'error', error: 'chatId and encryptedText required' });
          }
          return;
        }

        const message = {
          chatId,
          senderId: socket.userId,
          senderName: socket.username,
          encryptedText,
          type,
          giftId,
        };

        const messageId = await saveMessage(message);

        io.to(`chat:${chatId}`).emit('receive_message', {
          ...message,
          _id: messageId,
          createdAt: new Date(),
          deliveredTo: [socket.userId],
          readBy: [socket.userId],
          deleted: false,
        });

        if (callback) callback({ status: 'ok', messageId: String(messageId) });
      } catch (err) {
        console.error('❌ send_message error:', err);
        if (callback) callback({ status: 'error', error: err.message });
      }
    });

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

    socket.on('typing', ({ chatId }) => {
      if (!chatId) return;
      socket.to(`chat:${chatId}`).emit('user_typing', {
        userId: socket.userId,
        username: socket.username,
        chatId,
      });
    });

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