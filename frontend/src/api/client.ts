import axios from 'axios';

// ЕДИНСТВЕННЫЙ СЕРВЕР (PYTHON)
const PYTHON_API_URL = import.meta.env.VITE_API_URL || 'https://oursocial-python.onrender.com';

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
  bio?: string;
  statusText?: string;
  showLastSeen?: boolean;
  hideOnlineStatus?: boolean;
  hideReadReceipts?: boolean;
  lastSeen?: string | null;
  isPremium?: boolean;
  premiumUntil?: string | null;
  coinsBalance?: number;
}

export interface Contact extends User {
  nickname: string;
  chatHidden?: boolean;
}

export interface AuthResponse {
  status?: string;
  token: string;
  user: User;
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

export const keysApi = {
  upload: (publicKey: string) => api.post('/keys/upload', { publicKey }),
  me: () => api.get<{ userId: string; publicKey: string }>('/keys/me'),
  get: (userId: string) => api.get<{ userId: string; publicKey: string }>(`/keys/${userId}`),
  exchange: (targetUserId: string) => api.post<{ myKey: string; targetKey: string }>('/keys/exchange', { targetUserId }),
};