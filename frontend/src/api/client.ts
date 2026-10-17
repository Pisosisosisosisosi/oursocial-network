import axios from 'axios';

// Берем URL Python API (Auth + Keys) из переменных окружения
const PYTHON_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// Для Node.js (чаты) используем отдельный URL
const NODE_API_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

export const api = axios.create({
  baseURL: PYTHON_API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Автоматически добавляем JWT в заголовки
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Типы
export interface User {
  id: string;
  email: string;
  username: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// API для Python (Auth)
export const authApi = {
  register: (email: string, password: string, username: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, username }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  me: () => api.get<User>('/auth/me'),

  searchUsers: (q: string) =>
    api.get<User[]>(`/users/search`, { params: { q } }),
};

// API для Python (Keys)
export const keysApi = {
  upload: (publicKey: string) =>
    api.post('/keys/upload', { publicKey }),

  me: () =>
    api.get<{ userId: string; publicKey: string }>('/keys/me'),

  get: (userId: string) =>
    api.get<{ userId: string; publicKey: string }>(`/keys/${userId}`),

  exchange: (targetUserId: string) =>
    api.post<{ myKey: string; targetKey: string }>('/keys/exchange', { targetUserId }),
};