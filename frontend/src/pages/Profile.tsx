import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ArrowLeft, Coins, Crown, Eye, EyeOff, ImagePlus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const inputClassName = 'mt-2 h-12 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-slate-100 outline-none focus:border-indigo-400/50';

export default function Profile() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || '');
  const [username, setUsername] = useState(user?.username || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [statusText, setStatusText] = useState(user?.statusText || '');
  const [showLastSeen, setShowLastSeen] = useState(user?.showLastSeen ?? true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);

  const handleAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessageIsError(true);
      setMessage('Выберите файл изображения.');
      return;
    }
    if (file.size > 900 * 1024) {
      setMessageIsError(true);
      setMessage('Изображение должно быть меньше 900 КБ.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        setMessageIsError(false);
        setMessage('');
      }
    };
    reader.onerror = () => {
      setMessageIsError(true);
      setMessage('Не удалось прочитать изображение.');
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessageIsError(false);
    setMessage('');

    try {
      await api.patch('/users/me/profile', {
        displayName: displayName.trim(),
        username: username.trim(),
        avatarUrl,
        bio: bio.trim(),
        statusText: statusText.trim(),
        showLastSeen,
      });
      updateUser({ displayName: displayName.trim(), username: username.trim(), avatarUrl, bio: bio.trim(), statusText: statusText.trim(), showLastSeen });
      setMessage('Настройки профиля сохранены.');
    } catch (error: unknown) {
      const data = isAxiosError(error)
        ? error.response?.data as { detail?: string; error?: string } | undefined
        : undefined;
      setMessageIsError(true);
      setMessage(data?.detail || data?.error || 'Не удалось сохранить настройки профиля.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative h-full overflow-y-auto bg-[#090d16] px-4 py-8 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.15),transparent_55%)]" />
      <section className="relative mx-auto w-full max-w-2xl rounded-[28px] border border-white/[0.08] bg-[#101725]/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-200"
        >
          <ArrowLeft size={15} /> Назад к чатам
        </button>
        <div className="mb-7">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-300">Аккаунт</p>
          <h1 className="text-2xl font-semibold tracking-tight">Настройки профиля</h1>
          <p className="mt-2 text-sm text-slate-500">Управляйте публичной информацией и приватностью.</p>
        </div>

        <section className="mb-7 overflow-hidden rounded-2xl border border-amber-300/15 bg-gradient-to-r from-amber-300/[0.08] via-white/[0.025] to-indigo-400/[0.06] p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-amber-200/15 bg-amber-300/10 text-amber-200"><Coins size={21} /></span>
              <span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Skyline Coins</span>
                <span className="mt-0.5 block text-lg font-bold text-amber-100">{user?.coinsBalance ?? 0} <span className="text-xs font-medium text-slate-400">монет</span></span>
                <span className="block text-[10px] text-slate-500">{user?.isPremium ? 'Premium активен' : 'Откройте больше возможностей'}</span>
              </span>
            </div>
            <button type="button" onClick={() => navigate('/premium')} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-400 px-4 text-xs font-bold text-slate-950 transition hover:brightness-110">
              <Crown size={15} />{user?.isPremium ? 'Premium и монеты' : 'Купить Premium'}
            </button>
          </div>
          {user?.isPremium && user.premiumUntil && <p className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] text-slate-500">Premium действует до {new Date(user.premiumUntil).toLocaleDateString('ru-RU')}</p>}
        </section>

        <div className="mb-7 flex items-center gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-xl font-bold text-white">
            {avatarUrl
              ? <img src={avatarUrl} alt="Аватар профиля" className="h-full w-full object-cover" />
              : username?.[0]?.toLocaleUpperCase('ru-RU') || 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">{displayName || username}{user?.isPremium && <Crown size={14} className="shrink-0 fill-amber-300/20 text-amber-300" aria-label="Skyline Premium" />}</p>
            <p className="mt-1 truncate text-xs text-slate-500">@{username}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/5">
            <ImagePlus size={15} /> Изменить фото
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="sr-only" />
          </label>
          {avatarUrl && (
            <button type="button" onClick={() => setAvatarUrl('')} aria-label="Удалить фото профиля" className="rounded-lg p-2 text-slate-500 hover:bg-rose-400/10 hover:text-rose-300">
              <Trash2 size={15} />
            </button>
          )}
        </div>

        {message && (
          <div role="status" className={`mb-4 rounded-xl border px-3.5 py-3 text-sm ${messageIsError ? 'border-rose-400/20 bg-rose-400/[0.08] text-rose-200' : 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-200'}`}>
            {message}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          <section className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold">Публичный профиль</h2>
              <p className="mt-1 text-xs text-slate-500">Эти данные увидят пользователи, открывшие ваш профиль.</p>
            </div>
            <label className="block text-xs font-medium text-slate-400">
              Отображаемое имя
              <input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={32} className={inputClassName} required />
            </label>
            <label className="block text-xs font-medium text-slate-400">
              Имя пользователя
              <span className="mt-2 flex h-12 items-center rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm text-slate-500 focus-within:border-indigo-400/50">
                @
                <input type="text" value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" className="h-full min-w-0 flex-1 bg-transparent pl-1 text-slate-100 outline-none" required />
              </span>
              <span className="mt-1 block text-[10px] text-slate-600">Буквы латиницы, цифры, точка, дефис и подчёркивание.</span>
            </label>
            <label className="block text-xs font-medium text-slate-400">
              О себе
              <textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={300} rows={3} placeholder="Пара слов о себе" className="mt-2 w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none focus:border-indigo-400/50" />
              <span className="mt-1 block text-right text-[10px] text-slate-600">{bio.length}/300</span>
            </label>
            <label className="block text-xs font-medium text-slate-400">
              Статус
              <input type="text" value={statusText} onChange={(event) => setStatusText(event.target.value)} maxLength={80} placeholder="Например: на связи" className={inputClassName} />
            </label>
          </section>

          <section className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
            <div className="flex items-start gap-3">
              {showLastSeen ? <Eye size={17} className="mt-0.5 text-indigo-300" /> : <EyeOff size={17} className="mt-0.5 text-indigo-300" />}
              <div className="flex-1">
                <h2 className="text-sm font-semibold">Время последнего посещения</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">Разрешить другим пользователям видеть, когда вы заходили в Pulse.</p>
              </div>
              <input type="checkbox" checked={showLastSeen} onChange={(event) => setShowLastSeen(event.target.checked)} aria-label="Показывать время последнего посещения" className="mt-1 h-4 w-4 accent-indigo-500" />
            </div>
          </section>

          <button
            type="submit"
            disabled={loading || !displayName.trim() || !username.trim()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Сохраняем…' : <><Save size={16} /> Сохранить настройки</>}
          </button>
        </form>
        <p className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-600">
          <ShieldCheck size={13} className="text-emerald-400/70" /> Email и пароль не отображаются в профиле.
        </p>
      </section>
    </main>
  );
}
