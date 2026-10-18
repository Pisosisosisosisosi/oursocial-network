import { io, type Socket } from 'socket.io-client';

// ВРЕМЕННО ОТКЛЮЧАЕМ СТАРЫЙ СЕРВЕР
// const SOCKET_URL =
//   (import.meta.env && import.meta.env.VITE_SOCKET_URL) ||
//   'https://oursocial-network-production.up.railway.app';

let socket: Socket | null = null;

// Добавили подчеркивание перед token: _token
export function connectSocket(_token?: string): Socket {
  // ВРЕМЕННАЯ ЗАГЛУШКА: Возвращаем "пустой" сокет, чтобы ничего не ломалось
  if (!socket) {
    socket = io('http://localhost:8000', {
      autoConnect: false, // Не подключаемся реально
    });
  }
  console.log('⚠️ Socket.IO отключен (используется HTTP API)');
  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}