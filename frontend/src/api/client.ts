import axios from 'axios';

// ЖЕСТКО ПРОПИСЫВАЕМ URL PYTHON API НА RENDER
const PYTHON_API_URL =
  import.meta.env.VITE_API_URL || 'https://oursocial-python.onrender.com';
const MESSENGER_API_URL =
  import.meta.env.VITE_MESSENGER_API_URL ||
  'https://oursocial-network-production.up.railway.app';

export const api = axios.create({
  baseURL: PYTHON_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface User {
  id: string;
  email?: string;
  username: string;
  displayName?: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  status?: string;
  token: string;
  user: User;
}

export interface ChatParticipant {
  id: string;
  username: string;
  name?: string;
  avatar?: string | null;
  isOnline?: boolean;
}

export interface ChatMessage {
  _id?: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  encryptedText: string;
  type: 'text' | 'image' | 'gift';
  giftId?: string | null;
  createdAt?: string;
  readBy?: string[];
  deliveredTo?: string[];
  isEdited?: boolean;
}

export interface Chat {
  _id: string;
  type: 'direct' | 'group';
  title: string;
  avatar?: string | null;
  opponent?: ChatParticipant | null;
  participants: string[];
  participantDetails?: ChatParticipant[];
  unreadCount?: number;
  lastMessage?: ChatMessage | null;
  updatedAt?: string;
}

export interface SearchUser extends User {
  avatar?: string | null;
}

export const authApi = {
  register: (email: string, password: string, username: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, username }),
  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),
  me: () => api.get<User>('/auth/me'),
  searchUsers: (q: string) =>
    api.get<User[]>(`/users/search`, { params: { q } }),
};

export const messengerApi = axios.create({
  baseURL: MESSENGER_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

messengerApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const messenger = {
  chats: () => messengerApi.get<{ chats: Chat[] }>('/api/chats'),
  onlineUsers: () => messengerApi.get<{ online: string[] }>('/api/online'),
  createDirectChat: (participantId: string) =>
    messengerApi.post<{ chat: Chat }>('/api/chats', { participantId }),
  createGroupChat: (title: string, participantIds: string[]) =>
    messengerApi.post<{ chat: Chat }>('/api/chats', {
      type: 'group',
      title,
      participantIds,
    }),
  messages: (chatId: string, before?: string) =>
    messengerApi.get<{ messages: ChatMessage[]; count: number }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages`,
      { params: { limit: 50, order: 'desc', ...(before ? { before } : {}) } },
    ),
  editMessage: (chatId: string, messageId: string, encryptedText: string) =>
    messengerApi.patch<{ message: ChatMessage }>(
      `/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`,
      { encryptedText },
    ),
  deleteMessage: (chatId: string, messageId: string) =>
    messengerApi.delete(`/api/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}`),
  markRead: (chatId: string) =>
    messengerApi.post(`/api/chats/${encodeURIComponent(chatId)}/read`),
  addParticipants: (chatId: string, participantIds: string[]) =>
    messengerApi.post(
      `/api/chats/${encodeURIComponent(chatId)}/participants`,
      { participantIds },
    ),
};

export const keysApi = {
  upload: (publicKey: string) => api.post('/keys/upload', { publicKey }),
  me: () => api.get<{ userId: string; publicKey: string }>('/keys/me'),
  get: (userId: string) => api.get<{ userId: string; publicKey: string }>(`/keys/${userId}`),
  exchange: (targetUserId: string) => api.post<{ myKey: string; targetKey: string }>('/keys/exchange', { targetUserId }),
};