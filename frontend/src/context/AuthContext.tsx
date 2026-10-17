import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authApi, type User } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import { keysApi } from '../api/client';
import { generateKeyPair, hasPrivateKey, clearKeys } from '../crypto/keys';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
  setToken(null);
  setUser(null);
  disconnectSocket();
  clearKeys();
};

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}