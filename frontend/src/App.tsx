import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Chats from './pages/Chats';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Register from './pages/Register';
import VerifyEmail from './pages/VerifyEmail';
import UserProfile from './pages/UserProfile';
import Settings from './pages/Settings';
import Groups from './pages/Groups';
import { applyAppPreferences } from './preferences';
import { api } from './api/client';
import { getSocket } from './api/socket';
import { ToastProvider } from './context/ToastContext';
import { useToast } from './context/useToast';

const Channels = lazy(() => import('./pages/Channels'));
const Premium = lazy(() => import('./pages/Premium'));

function GlobalNotifications() {
  const { user } = useAuth();
  const showToast = useToast();
  const userId = user?.id;
  const [connectionLost, setConnectionLost] = useState(!navigator.onLine);

  useEffect(() => {
    const socket = getSocket();
    if (!userId || !socket) return;
    const handleConnect = () => setConnectionLost(false);
    const handleDisconnect = () => setConnectionLost(true);
    const handleConnectError = () => setConnectionLost(true);
    const handleOffline = () => setConnectionLost(true);
    const handleOnline = () => {
      if (socket.connected) setConnectionLost(false);
    };

    const handleMessageChanged = (event: { action: string; senderId?: string; groupId?: string }) => {
      if (
        event.action !== 'created'
        || !event.senderId
        || event.senderId === userId
        || !document.hidden
        || localStorage.getItem('skylineNotifications') !== 'true'
        || !('Notification' in window)
        || Notification.permission !== 'granted'
      ) return;

      const messagePath = typeof event.groupId === 'string'
        ? `/groups/${event.groupId}/messages`
        : `/messages/${event.senderId}`;
      void api.get(messagePath, { params: { limit: 20 } }).then((response) => {
        const newest = response.data[response.data.length - 1];
        if (!newest || newest.senderId !== event.senderId) return;
        new Notification('Новое сообщение в Skyline', {
          body: newest.type === 'text' ? newest.text : `Отправлен файл: ${newest.fileName || 'вложение'}`,
          icon: `${import.meta.env.BASE_URL}skyline-icon.svg`,
        });
      }).catch((error: unknown) => {
        console.error('Не удалось загрузить данные для уведомления:', error);
      });
    };
    const handleGroupMention = (event: { groupTitle?: string; senderUsername?: string }) => {
      const title = `Упоминание в группе «${event.groupTitle || 'Общая группа'}»`;
      const body = `@${event.senderUsername || 'пользователь'} упомянул вас.`;
      showToast(`${title}: ${body}`, 'info');
      if (
        document.hidden
        && localStorage.getItem('skylineNotifications') === 'true'
        && 'Notification' in window
        && Notification.permission === 'granted'
      ) {
        new Notification(title, {
          body,
          icon: `${import.meta.env.BASE_URL}skyline-icon.svg`,
        });
      }
    };

    socket.on('message_changed', handleMessageChanged);
    socket.on('group_mention', handleGroupMention);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      socket.off('message_changed', handleMessageChanged);
      socket.off('group_mention', handleGroupMention);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [userId, showToast]);

  if (!userId || !connectionLost) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[190] flex items-center justify-center gap-2 bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
      {navigator.onLine ? 'Переподключение к Skyline…' : 'Нет соединения с интернетом'}
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  useEffect(() => {
    applyAppPreferences(Boolean(user?.isPremium));
  }, [user?.isPremium]);

  if (loading) {
    return (
      <div className="grid h-full w-full place-items-center bg-bg-base text-sm text-t-secondary">
        <span className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          Подключаемся к Skyline…
        </span>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/chats" element={user ? <Chats /> : <Navigate to="/login" replace />} />
      <Route path="/" element={user ? <Chats /> : <Navigate to="/login" replace />} />
      <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
      <Route path="/premium" element={user
        ? <Suspense fallback={<div className="grid h-full place-items-center text-sm text-t-secondary">Загружаем Skyline Premium…</div>}><Premium /></Suspense>
        : <Navigate to="/login" replace />} />
      <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
      <Route path="/groups" element={user ? <Groups /> : <Navigate to="/login" replace />} />
      <Route path="/channels" element={user
        ? <Suspense fallback={<div className="grid h-full place-items-center text-sm text-t-secondary">Загружаем каналы…</div>}><Channels /></Suspense>
        : <Navigate to="/login" replace />} />
      <Route path="/join/:inviteCode" element={<Suspense fallback={<div className="grid h-full place-items-center text-sm text-t-secondary">Загружаем канал…</div>}><Channels /></Suspense>} />
      <Route path="/users/:userId" element={user ? <UserProfile /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    applyAppPreferences();
    document.body.classList.add('h-full', 'overflow-hidden', 'bg-bg-base', 'text-t-primary');
    document.body.style.fontFamily = '"Inter", ui-sans-serif, system-ui, sans-serif';

    return () => {
      document.body.classList.remove('h-full', 'overflow-hidden', 'bg-bg-base', 'text-t-primary');
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
      <ToastProvider>
        <GlobalNotifications />
        <div className="app-shell relative h-[100dvh] w-screen overflow-hidden bg-bg-base font-sans text-t-primary">
          <AppRoutes />
        </div>
      </ToastProvider>
      </HashRouter>
    </AuthProvider>
  );
}
