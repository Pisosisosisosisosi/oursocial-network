import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../api/client'; // <--- Импортируем наш API

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Используем наш обновленный API
      const res = await authApi.register(email, password, username);
      
      // Сохраняем токен и данные пользователя
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      
      // Переходим в чаты
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка регистрации');
    }
  };

  return (
    <div className="flex h-full w-full bg-[#090d16] text-slate-100 items-center justify-center p-4">
      <div className="glass-panel w-full max-w-md rounded-3xl p-8 relative z-10 shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-6">Создайте аккаунт</h2>
        {error && <div className="bg-rose-500/10 text-rose-400 p-3 rounded-xl mb-4 text-sm">{error}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Имя пользователя</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Электронная почта</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Пароль</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
              required
            />
          </div>
          
          <button type="submit" className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all">
            Зарегистрироваться
          </button>
        </form>
        
        <div className="text-center mt-4 text-xs text-slate-400">
          Уже есть аккаунт? <Link to="/login" className="text-indigo-400 hover:underline">Войти</Link>
        </div>
      </div>
    </div>
  );
}