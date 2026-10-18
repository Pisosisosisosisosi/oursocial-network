import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Chats from './pages/Chats';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Register from './pages/Register';
import UserProfile from './pages/UserProfile';

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
      <Route path="/users/:userId" element={user ? <UserProfile /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    document.body.classList.add('h-full', 'overflow-hidden', 'bg-[#090d16]', 'text-slate-100');
    document.body.style.fontFamily = '"Plus Jakarta Sans", sans-serif';

    return () => {
      document.body.classList.remove('h-full', 'overflow-hidden', 'bg-[#090d16]', 'text-slate-100');
      document.body.style.fontFamily = '';
    };
  }, []);

  return (
    <AuthProvider>
      <HashRouter>
        <div className="relative h-screen w-screen overflow-hidden bg-[#090d16] font-sans text-slate-100">
          <AppRoutes />
        </div>
      </HashRouter>
    </AuthProvider>
  );
}
