import { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MessageCircle, Radio, UsersRound } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Chats from './pages/Chats';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Register from './pages/Register';
import UserProfile from './pages/UserProfile';
import Settings from './pages/Settings';
import Groups from './pages/Groups';
import { applyAppPreferences } from './preferences';
import { api } from './api/client';
import { getSocket } from './api/socket';
import { ToastProvider } from './context/ToastContext';
import { useToast } from './context/useToast';

const Channels = lazy(() => import('./pages/Channels'));

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
        || localStorage.getItem('pulseNotifications') !== 'true'
        || !('Notification' in window)
        || Notification.permission !== 'granted'
      ) return;

      const messagePath = typeof event.groupId === 'string'
        ? `/groups/${event.groupId}/messages`
        : `/messages/${event.senderId}`;
      void api.get(messagePath, { params: { limit: 20 } }).then((response) => {
        const newest = response.data[response.data.length - 1];
        if (!newest || newest.senderId !== event.senderId) return;
        new Notification('Новое сообщение в Pulse', {
          body: newest.type === 'text' ? newest.text : `Отправлен файл: ${newest.fileName || 'вложение'}`,
          icon: `${import.meta.env.BASE_URL}pulse-icon.svg`,
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
        && localStorage.getItem('pulseNotifications') === 'true'
        && 'Notification' in window
        && Notification.permission === 'granted'
      ) {
        new Notification(title, {
          body,
          icon: `${import.meta.env.BASE_URL}pulse-icon.svg`,
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
      {navigator.onLine ? 'Переподключение к Pulse…' : 'Нет соединения с интернетом'}
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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

  const currentTab = location.pathname.startsWith('/groups')
    ? 'groups'
    : location.pathname.startsWith('/channels') || location.pathname.startsWith('/join/')
      ? 'channels'
      : 'chats';
  const showWorkspaceTabs = Boolean(user) && (
    location.pathname === '/'
    || location.pathname === '/groups'
    || location.pathname === '/channels'
    || location.pathname.startsWith('/join/')
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {showWorkspaceTabs && (
        <nav aria-label="Разделы Pulse" className="z-20 flex shrink-0 items-center gap-1 border-b border-white/[0.08] bg-[#0d1420] px-2 py-1.5 sm:gap-2 sm:px-4">
          {([
            { id: 'chats', label: 'Чаты', path: '/', icon: MessageCircle },
            { id: 'groups', label: 'Группы', path: '/groups', icon: UsersRound },
            { id: 'channels', label: 'Каналы', path: '/channels', icon: Radio },
          ] as const).map(({ id, label, path, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => navigate(path)}
              aria-current={currentTab === id ? 'page' : undefined}
              className={`flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition sm:flex-none sm:min-w-28 sm:px-5 ${currentTab === id ? 'bg-indigo-500/15 text-indigo-200 shadow-inner shadow-indigo-400/5' : 'text-slate-500 hover:bg-white/[0.04] hover:text-slate-200'}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1">
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
          <Route path="/" element={user ? <Chats /> : <Navigate to="/login" replace />} />
          <Route path="/profile" element={user ? <Profile /> : <Navigate to="/login" replace />} />
          <Route path="/settings" element={user ? <Settings /> : <Navigate to="/login" replace />} />
          <Route path="/groups" element={user ? <Groups /> : <Navigate to="/login" replace />} />
          <Route path="/channels" element={user
            ? <Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">Загружаем каналы…</div>}><Channels /></Suspense>
            : <Navigate to="/login" replace />} />
          <Route path="/join/:inviteCode" element={<Suspense fallback={<div className="grid h-full place-items-center text-sm text-slate-400">Загружаем канал…</div>}><Channels /></Suspense>} />
          <Route path="/users/:userId" element={user ? <UserProfile /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
        </Routes>
      </div>
    </div>
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
      <ToastProvider>
        <GlobalNotifications />
        <div className="app-shell relative h-[100dvh] w-screen overflow-hidden bg-[#090d16] font-sans text-slate-100">
          <AppRoutes />
        </div>
      </ToastProvider>
      </HashRouter>
    </AuthProvider>
  );
}
