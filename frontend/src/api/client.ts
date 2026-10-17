import axios from 'axios';

// Берем URL из переменных окружения (Vercel/GitHub Actions) или используем localhost для разработки
const PYTHON_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
// Для Node.js (чаты) используем отдельный URL, если он нужен, но пока все REST-запросы у нас идут в Python
const NODE_API_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001';

// Создаем клиент для Python API (Auth + Keys)
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

// Типы для API
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

// API-функции для Python (Auth)
export const authApi = {
  register: (email: string, password: string, username: string) =>
    api.post<AuthResponse>('/auth/register', { email, password, username }),

  login: (email: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { email, password }),

  me: () => api.get<User>('/auth/me'),

  searchUsers: (q: string) =>
    api.get<User[]>(`/users/search`, { params: { q } }),
};

// API-функции для Python (Keys)
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