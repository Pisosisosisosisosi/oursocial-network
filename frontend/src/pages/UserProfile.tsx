import { useEffect, useState } from 'react';
import { ArrowLeft, Crown, UserRoundCheck, UserRoundPlus } from 'lucide-react';
import { isAxiosError } from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Contact, type User } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const isOwnProfile = userId === currentUser?.id;
  const loading = loadedUserId !== userId;

  useEffect(() => {
    if (!userId) return;
    if (userId === currentUser?.id) {
      navigate('/profile', { replace: true });
      return;
    }

    let isCurrent = true;
    async function loadProfile() {
      try {
        const [profileResponse, contactsResponse] = await Promise.all([
          api.get<User>(`/users/${userId}`),
          api.get<Contact[]>('/contacts'),
        ]);
        if (!isCurrent) return;
        setProfile(profileResponse.data);
        setContact(contactsResponse.data.find((item) => item.id === userId) || null);
        setError('');
      } catch (loadError: unknown) {
        const data = isAxiosError(loadError)
          ? loadError.response?.data as { detail?: string } | undefined
          : undefined;
        if (isCurrent) setError(data?.detail || 'Не удалось загрузить профиль пользователя.');
      } finally {
        if (isCurrent) setLoadedUserId(userId || null);
      }
    }

    void loadProfile();
    return () => { isCurrent = false; };
  }, [userId, currentUser?.id, navigate]);

  const handleContact = async () => {
    if (!profile) return;
    const nickname = window.prompt(
      contact ? 'Изменить имя контакта' : 'Как записать пользователя в контактах?',
      contact?.nickname || profile.displayName || profile.username,
    );
    if (nickname === null) return;
    if (!nickname.trim()) {
      setNoticeIsError(true);
      setNotice('Имя контакта не может быть пустым.');
      return;
    }

    setSavingContact(true);
    setNoticeIsError(false);
    setNotice('');
    try {
      const response = await api.put('/contacts', { userId: profile.id, nickname: nickname.trim() });
      setContact({ ...profile, nickname: response.data.contact.nickname });
      setNotice('Контакт сохранён.');
    } catch (saveError: unknown) {
      const data = isAxiosError(saveError)
        ? saveError.response?.data as { detail?: string } | undefined
        : undefined;
      setNoticeIsError(true);
      setNotice(data?.detail || 'Не удалось сохранить контакт.');
    } finally {
      setSavingContact(false);
    }
  };

  if (loading) {
    return <main className="grid h-full place-items-center bg-[#090d16] text-sm text-slate-400">Загружаем профиль…</main>;
  }

  return (
    <main className="relative h-full overflow-y-auto bg-[#090d16] px-4 py-8 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.15),transparent_55%)]" />
      <section className="relative mx-auto w-full max-w-xl rounded-[28px] border border-white/[0.08] bg-[#101725]/90 p-6 shadow-2xl shadow-black/30 backdrop-blur-xl sm:p-9">
        <button type="button" onClick={() => navigate('/')} className="mb-7 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-200">
          <ArrowLeft size={15} /> Назад к контактам
        </button>

        {error ? (
          <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] p-4 text-sm text-rose-200">{error}</div>
        ) : profile && (
          <>
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-2xl font-bold">
                {profile.avatarUrl
                  ? <img src={profile.avatarUrl} alt={`Аватар ${profile.username}`} className="h-full w-full object-cover" />
                  : profile.username[0]?.toLocaleUpperCase('ru-RU')}
              </div>
              <div className="min-w-0">
                <h1 className="flex items-center gap-2 truncate text-2xl font-semibold">{profile.displayName || profile.username}{profile.isPremium && <Crown size={19} className="shrink-0 fill-amber-300/20 text-amber-300" aria-label="Skyline Premium" />}</h1>
                <p className="mt-1 truncate text-sm text-slate-500">@{profile.username}</p>
                {profile.statusText && <p className="mt-2 text-sm text-indigo-200">{profile.statusText}</p>}
              </div>
            </div>

            {profile.bio && (
              <div className="mt-7 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">О себе</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{profile.bio}</p>
              </div>
            )}

            {profile.createdAt && (
              <dl className="mt-7 space-y-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">В Skyline с</dt>
                  <dd className="text-right text-slate-300">{new Date(profile.createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
                </div>
              </dl>
            )}

            {profile.lastSeen && (
              <p className="mt-5 text-xs text-slate-500">
                Последнее посещение: {new Date(profile.lastSeen).toLocaleString()}
              </p>
            )}

            {!isOwnProfile && (
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={() => void handleContact()} disabled={savingContact} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50">
                  {contact ? <UserRoundCheck size={16} /> : <UserRoundPlus size={16} />}
                  {contact ? `В контактах: ${contact.nickname}` : 'Добавить в контакты'}
                </button>
              </div>
            )}
            {notice && <p role="status" className={`mt-4 text-xs ${noticeIsError ? 'text-rose-300' : 'text-emerald-300'}`}>{notice}</p>}
          </>
        )}
      </section>
    </main>
  );
}
