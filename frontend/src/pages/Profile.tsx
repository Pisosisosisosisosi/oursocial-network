import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function Profile() {
  const navigate = useNavigate();
  const userString = localStorage.getItem('user');
  const currentUser = userString ? JSON.parse(userString) : null;

  const [displayName, setDisplayName] = useState(currentUser?.displayName || currentUser?.username || '');
  const [username, setUsername] = useState(currentUser?.username || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    // Если вдруг данных нет, стучимся на сервер за актуальными
    async function fetchMe() {
      try {
        const res = await api.get('/auth/me');
        setDisplayName(res.data.displayName || res.data.username);
        setUsername(res.data.username);
        localStorage.setItem('user', JSON.stringify(res.data));
      } catch (e) {
        console.error("Ошибка загрузки профиля:", e);
      }
    }
    if (!currentUser) fetchMe();
  }, [currentUser]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await api.patch('/users/me/profile', { displayName, username, avatarUrl: "" });
      
      // Обновляем данные в localStorage
      const updatedUser = { ...currentUser, displayName, username };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      setMessage('Профиль успешно обновлен!');
      
      // Возвращаемся в чаты через 1.5 секунды
      setTimeout(() => navigate('/'), 1500);
    } catch (error: any) {
      setMessage(error.response?.data?.detail || 'Ошибка при обновлении профиля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full bg-[#090d16] text-slate-100 font-sans absolute top-0 left-0 items-center justify-center p-4">
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { font-family: 'Inter', sans-serif; }
        .glass-panel { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); }
      `}</style>

      {/* Декоративный фон */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#090d16] to-black pointer-events-none"></div>

      <div className="glass-panel w-full max-w-md rounded-3xl p-8 relative z-10 shadow-2xl">
        
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">Мой профиль</h2>
          <button onClick={() => navigate('/')} className="text-xs text-slate-400 hover:text-white transition-colors bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700">
            ← Назад в чаты
          </button>
        </div>

        {message && (
          <div className={`p-3 rounded-xl mb-4 text-xs text-center border ${message.includes('Ошибка') ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          
          {/* Аватар-заглушка */}
          <div className="flex flex-col items-center justify-center mb-6">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-emerald-400 flex items-center justify-center text-3xl font-bold text-slate-950 shadow-[0_0_30px_rgba(99,102,241,0.3)]">
              {username?.[0]?.toUpperCase() || 'U'}
            </div>
            <p className="text-[10px] text-slate-500 mt-3">Аватар задается автоматически</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Отображаемое имя</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Юзернейм (@username)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-sm shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all disabled:opacity-50"
          >
            {loading ? 'Сохранение...' : 'Сохранить изменения'}
          </button>

        </form>
      </div>
    </div>
  );
}