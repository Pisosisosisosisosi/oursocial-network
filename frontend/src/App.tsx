import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Chats from './pages/Chats';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Register from './pages/Register';
import UserProfile from './pages/UserProfile';
import Settings from './pages/Settings';
import { applyAppPreferences } from './preferences';
import { api } from './api/client';
import { getSocket } from './api/socket';

function GlobalNotifications() {
  const { user } = useAuth();
  const userId = user?.id;
  const username = user?.username;

  useEffect(() => {
    const socket = getSocket();
    if (!userId || !username || !socket) return;

    const handleMessageChanged = (event: { action: string; senderId?: string }) => {
      if (
        event.action !== 'created'
        || !event.senderId
        || event.senderId === userId
        || !document.hidden
        || localStorage.getItem('pulseNotifications') !== 'true'
        || !('Notification' in window)
        || Notification.permission !== 'granted'
      ) return;

      void api.get(`/messages/${event.senderId}`).then((response) => {
        const newest = response.data[response.data.length - 1];
        if (!newest || newest.senderId !== event.senderId) return;
        new Notification(`Новое сообщение от @${username}`, {
          body: newest.type === 'text' ? newest.text : `Отправлен файл: ${newest.fileName || 'вложение'}`,
          icon: `${import.meta.env.BASE_URL}pulse-icon.svg`,
        });
      }).catch((error: unknown) => {
        console.error('Не удалось загрузить данные для уведомления:', error);
      });
    };

    socket.on('message_changed', handleMessageChanged);
    return () => {
      socket.off('message_changed', handleMessageChanged);
    };
  }, [userId, username]);

  return null;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid h-full w-full place-items-center bg-[#090d16] text-sm text-slate-400">
        <span className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Подключаемся к OurSocial…
        </span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/" element={user ? <Chats /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
      <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
      <Route path="/users/:userId" element={user ? <UserProfile /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    applyAppPreferences();
    document.body.classList.add('h-full', 'overflow-hidden', 'bg-[#090d16]', 'text-slate-100');
    document.body.style.fontFamily = '"Plus Jakarta Sans", sans-serif';

    return () => {
      document.body.classList.remove('h-full', 'overflow-hidden', 'bg-[#090d16]', 'text-slate-100');
      document.body.style.fontFamily = '';
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.error('Service worker registration failed:', error);
    });
  }, []);

  return (
    <AuthProvider>
      <HashRouter>
        <GlobalNotifications />
        <div className="app-shell relative h-[100dvh] w-screen overflow-hidden bg-[#090d16] font-sans text-slate-100">
          <AppRoutes />
        </div>
      </HashRouter>
    </AuthProvider>
  );
}
