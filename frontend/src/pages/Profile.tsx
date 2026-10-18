import { useState, type FormEvent } from 'react';
import { ArrowLeft, Save, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '');
  const [username, setUsername] = useState(user?.username || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      await api.patch('/users/me/profile', { displayName, username, avatarUrl: "" });
      updateUser({ displayName, username });
      
      setMessage('Профиль успешно обновлен!');
      
      // Возвращаемся в чаты через 1.5 секунды
      setTimeout(() => navigate('/'), 1500);
    } catch (error: unknown) {
      const data = isAxiosError(error)
        ? error.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      setMessage(data?.detail || data?.error || 'Ошибка при обновлении профиля');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative grid h-full w-full place-items-center overflow-y-auto bg-[#090d16] p-4 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.15),transparent_55%)]" />
      <section className="relative w-full max-w-lg rounded-[28px] border border-white/[0.08] bg-[#101725]/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-200"
        >
          <ArrowLeft size={15} /> Назад к чатам
        </button>
        <div className="mb-7">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-300">Аккаунт</p>
          <h1 className="text-2xl font-semibold tracking-tight">Мой профиль</h1>
          <p className="mt-2 text-sm text-slate-500">Настройте, как вас видят собеседники.</p>
        </div>

        <div className="mb-7 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-xl font-bold text-white">
            {username?.[0]?.toLocaleUpperCase('ru-RU') || 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{displayName || username}</p>
            <p className="mt-1 truncate text-xs text-slate-500">@{username}</p>
          </div>
        </div>

        {message && (
          <div role="status" className={`mb-4 rounded-xl border px-3.5 py-3 text-sm ${message.includes('Ошибка') || message.includes('taken') ? 'border-rose-400/20 bg-rose-400/[0.08] text-rose-200' : 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-400">Отображаемое имя</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              minLength={2}
              maxLength={32}
              className="h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-slate-100 outline-none focus:border-indigo-400/50"
              required
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-slate-400">Имя пользователя</span>
            <span className="flex h-12 items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-slate-500 focus-within:border-indigo-400/50">
              @
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                minLength={3}
                maxLength={32}
                className="h-full min-w-0 flex-1 bg-transparent pl-1 text-slate-100 outline-none"
                required
              />
            </span>
          </label>
          <button
            type="submit"
            disabled={loading || !displayName.trim() || !username.trim()}
            className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {loading ? 'Сохраняем…' : <> <Save size={16} /> Сохранить изменения</>}
          </button>
        </form>
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-600">
          <ShieldCheck size={13} className="text-emerald-400/70" /> Профиль виден только участникам ваших чатов
        </p>
      </section>
    </main>
  );
}