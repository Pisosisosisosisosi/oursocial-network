import axios from 'axios';

const API_URL =
  (import.meta.env && import.meta.env.VITE_API_URL) ||
  'https://oursocial-network-production.up.railway.app';

export const api = axios.create({
  baseURL: API_URL,
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
  email?: string;
  username: string;
  name?: string;
  avatarUrl?: string;
}

export interface AuthResponse {
  status?: string;
  token: string;
  user: User;
}

// API-функции
export const authApi = {
  register: async (email: string, password: string, username: string) => {
    const cleanUsername = (username || (email ? email.split('@')[0] : 'user')).trim().toLowerCase();
    const payload = {
      email: email ? email.trim().toLowerCase() : `${cleanUsername}@example.com`,
      username: cleanUsername,
      name: username || cleanUsername,
      password,
    };

    try {
      const res = await api.post<AuthResponse>('/api/auth/register', payload);
      return res;
    } catch (err: any) {
      if (err.response?.status === 404) {
        return await api.post<AuthResponse>('/auth/register', payload);
      }
      throw err;
    }
  },

  login: async (emailOrUsername: string, password: string) => {
    const cleanLogin = (emailOrUsername || '').trim();
    const payload = {
      username: cleanLogin.toLowerCase(),
      email: cleanLogin.toLowerCase(),
      password,
    };

    try {
      const res = await api.post<AuthResponse>('/api/auth/login', payload);
      return res;
    } catch (err: any) {
      if (err.response?.status === 404) {
        return await api.post<AuthResponse>('/auth/login', payload);
      }
      throw err;
    }
  },

  me: async () => {
    try {
      const res = await api.get<any>('/api/auth/me');
      const userData = res.data?.user || res.data;
      return { ...res, data: userData as User };
    } catch (err: any) {
      if (err.response?.status === 404) {
        const res = await api.get<any>('/auth/me');
        const userData = res.data?.user || res.data;
        return { ...res, data: userData as User };
      }
      throw err;
    }
  },

  searchUsers: async (q: string) => {
    try {
      const res = await api.get<any>('/api/auth/users', { params: { q } });
      const users = res.data?.users || res.data;
      return { ...res, data: (Array.isArray(users) ? users : []) as User[] };
    } catch (err: any) {
      try {
        const res = await api.get<any>('/api/users/search', { params: { q } });
        const users = res.data?.users || res.data;
        return { ...res, data: (Array.isArray(users) ? users : []) as User[] };
      } catch {
        try {
          const res = await api.get<any>('/users/search', { params: { q } });
          const users = res.data?.users || res.data;
          return { ...res, data: (Array.isArray(users) ? users : []) as User[] };
        } catch {
          return { data: [] as User[] };
        }
      }
    }
  },
};

// Локальное хранилище публичных ключей (поскольку бэкенд Railway не имеет таблицы /keys)
const localKeys = new Map<string, string>();

export const keysApi = {
  upload: async (publicKey: string) => {
    try {
      localStorage.setItem('e2e_my_public_key', publicKey);
      localKeys.set('me', publicKey);
      return { data: { ok: true } };
    } catch {
      return { data: { ok: true } };
    }
  },

  me: async () => {
    const key = localKeys.get('me') || localStorage.getItem('e2e_my_public_key') || '';
    return { data: { userId: 'me', publicKey: key } };
  },

  get: async (userId: string) => {
    const key = localKeys.get(userId) || (userId === 'me' ? localStorage.getItem('e2e_my_public_key') : '') || '';
    return { data: { userId, publicKey: key } };
  },

  exchange: async (_targetUserId: string) => {
    const myKey = localKeys.get('me') || localStorage.getItem('e2e_my_public_key') || '';
    return { data: { myKey, targetKey: '' } };
  },
};