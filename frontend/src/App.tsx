import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Оставили только те страницы, которые точно есть
import Login from './pages/Login'; 
import Register from './pages/Register';
import Chats from './pages/Chats';

export default function App() {
  const isAuth = !!localStorage.getItem('token');

  useEffect(() => {
    document.body.classList.add('theme-indigo', 'bg-custom-main', 'text-slate-100', 'h-full', 'overflow-hidden');
    document.body.style.fontFamily = '"Plus Jakarta Sans", sans-serif';
    
    return () => {
      document.body.classList.remove('theme-indigo', 'bg-custom-main', 'text-slate-100', 'h-full', 'overflow-hidden');
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="flex h-screen w-screen overflow-hidden bg-[#090d16] relative text-slate-100 font-sans">
        <Routes>
          <Route path="/login" element={!isAuth ? <Login /> : <Navigate to="/" />} />
          <Route path="/register" element={!isAuth ? <Register /> : <Navigate to="/" />} />
          
          {/* Убрали отдельный роут для Profile, так как он скорее всего внутри Chats */}
          <Route path="/" element={isAuth ? <Chats /> : <Navigate to="/login" />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}