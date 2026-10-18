import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi, type User } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import { keysApi } from '../api/client';
import { getOrCreateKeyPair } from '../crypto/keys';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string, verificationToken: string) => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function uploadE2EPublicKey(userId: string) {
  const { publicKeyJwk } = await getOrCreateKeyPair(userId);
  await keysApi.upload(publicKeyJwk);
}

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
          const userData = (res.data as any)?.user || res.data;
          setUser(userData);
          setToken(savedToken);
          connectSocket(savedToken);
          try {
            await uploadE2EPublicKey(userData.id);
          } catch (error) {
            console.error('❌ Failed to generate/upload E2E keys:', error);
          }
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
    const token = res.data.token;
    const userData = res.data.user || (res.data as any);
    localStorage.setItem('token', token);
    setToken(token);
    setUser(userData);
    connectSocket(token);

    try {
      await uploadE2EPublicKey(userData.id);
      console.log('✅ E2E public key uploaded');
    } catch (err) {
      console.error('❌ Failed to generate/upload keys:', err);
    }
  };

  const register = async (email: string, password: string, username: string, verificationToken: string) => {
    const res = await authApi.register(email, password, username, verificationToken);
    const token = res.data.token;
    const userData = res.data.user || (res.data as any);
    localStorage.setItem('token', token);
    setToken(token);
    setUser(userData);
    connectSocket(token);

    try {
      await uploadE2EPublicKey(userData.id);
      console.log('✅ E2E keys generated and uploaded');
    } catch (err) {
      console.error('❌ Failed to generate/upload keys:', err);
    }
  };

  const updateUser = (updates: Partial<User>) => {
    setUser((currentUser) => currentUser ? { ...currentUser, ...updates } : currentUser);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    disconnectSocket();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}