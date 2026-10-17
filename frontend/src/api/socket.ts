import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = (import.meta.env && import.meta.env.VITE_SOCKET_URL) || 'http://localhost:3001';

let socket: Socket | null = null;

export function connectSocket(token?: string): Socket {
  const authToken = token || localStorage.getItem('token') || '';
  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token: authToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket?.id);
  });

  socket.on('connect_error', (err) => {
    console.error('❌ Socket error:', err.message);
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });

  return socket;
}

export function getSocket(): Socket | null {
  if (!socket || !socket.connected) {
    const token = localStorage.getItem('token');
    if (token) {
      if (!socket) {
        return connectSocket(token);
      }
      if (!socket.connected) {
        socket.connect();
      }
    }
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}