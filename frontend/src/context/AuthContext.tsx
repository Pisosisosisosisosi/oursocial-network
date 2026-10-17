import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi, type User } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import { keysApi } from '../api/client';
import { generateKeyPair, hasPrivateKey, clearKeys } from '../crypto/keys';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginAsDemo: (username?: string) => void;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const savedToken = localStorage.getItem('token');
      if (savedToken) {
        if (savedToken.startsWith('demo-token')) {
          const savedUser = localStorage.getItem('demo_user');
          if (savedUser) {
            try {
              setUser(JSON.parse(savedUser));
            } catch {
              setUser({ id: 'demo-user-1', email: 'demo@example.com', username: 'Демо-Пользователь' });
            }
          } else {
            setUser({ id: 'demo-user-1', email: 'demo@example.com', username: 'Демо-Пользователь' });
          }
          setToken(savedToken);
          setLoading(false);
          return;
        }

        try {
          const res = await authApi.me();
          setUser(res.data);
          setToken(savedToken);
          connectSocket(savedToken);
        } catch {
          localStorage.removeItem('token');
          setToken(null);
        }
      }
      setLoading(false);
    };
    init();
  }, []);

const login = async (email: string, password: string) => {
  const res = await authApi.login(email, password);
  localStorage.setItem('token', res.data.token);
  setToken(res.data.token);
  setUser(res.data.user);
  connectSocket(res.data.token);

  if (!hasPrivateKey()) {
    try {
      const { publicKeyJwk } = await generateKeyPair();
      await keysApi.upload(publicKeyJwk);
      console.log('✅ E2E keys generated and uploaded');
    } catch (err) {
      console.error('❌ Failed to generate/upload keys:', err);
    }
  } else {
    console.log('✅ Using existing E2E keys');
  }
};

const loginAsDemo = (demoUsername = 'Демо-Пользователь') => {
  const demoUser: User = {
    id: 'demo-' + Math.random().toString(36).substring(2, 8),
    email: 'demo@example.com',
    username: demoUsername,
  };
  const demoToken = 'demo-token-' + Date.now();
  localStorage.setItem('token', demoToken);
  localStorage.setItem('demo_user', JSON.stringify(demoUser));
  setToken(demoToken);
  setUser(demoUser);
};

const register = async (email: string, password: string, username: string) => {
  const res = await authApi.register(email, password, username);
  localStorage.setItem('token', res.data.token);
  setToken(res.data.token);
  setUser(res.data.user);
  connectSocket(res.data.token);

  try {
    const { publicKeyJwk } = await generateKeyPair();
    await keysApi.upload(publicKeyJwk);
    console.log('✅ E2E keys generated and uploaded');
  } catch (err) {
    console.error('❌ Failed to generate/upload keys:', err);
  }
};

const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('demo_user');
  setToken(null);
  setUser(null);
  disconnectSocket();
  clearKeys();
};

  return (
    <AuthContext.Provider value={{ user, token, loading, login, loginAsDemo, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}