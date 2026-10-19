import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Contrast, Download, LogOut, MessageSquare, Shield, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { applyAppPreferences, APP_THEMES, type AppTheme } from '../preferences';
import { api } from '../api/client';
import { useToast } from '../context/useToast';
import GlassPanel from '../components/ui/GlassPanel';
import Toggle from '../components/ui/Toggle';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/* Превью-свотчи совпадают с темами в index.css */
const THEME_PREVIEW: Record<AppTheme, [string, string, string]> = {
  skyline: ['#090d16', '#6366f1', '#10b981'],
  cyber:   ['#0b1221', '#22d3ee', '#a855f7'],
  cosmos:  ['#100d21', '#7c3aed', '#ec4899'],
  sakura:  ['#1b1120', '#f472b6', '#fb7185'],
  midnight:['#0a1128', '#1e3a8a', '#60a5fa'],
  ocean:   ['#06202a', '#0e7490', '#2dd4bf'],
  sunset:  ['#1c0f0a', '#f97316', '#e11d48'],
  forest:  ['#07150c', '#15803d', '#4ade80'],
  royal:   ['#151007', '#b45309', '#fbbf24'],
  rose:    ['#190a0e', '#be123c', '#fb7185'],
  violet:  ['#120a1e', '#7e22ce', '#c084fc'],
  mono:    ['#0c0d10', '#64748b', '#e2e8f0'],
  matrix:  ['#031007', '#16a34a', '#a3e635'],
  arctic:  ['#0a1520', '#0369a1', '#a5f3fc'],
  mocha:   ['#140f0a', '#78350f', '#d6a26a'],
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const showToast = useToast();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('skylineTheme') === 'light' ? 'light' : 'dark');
  const [appTheme, setAppTheme] = useState<AppTheme>(() => (localStorage.getItem('skylineAppTheme') as AppTheme) || 'skyline');
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('skylineCompactMode') === 'true');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('skylineReduceMotion') === 'true');
  const [messageSize, setMessageSize] = useState(() => localStorage.getItem('skylineMessageSize') || 'medium');
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem('skylineEnterToSend') !== 'false');
  const [showReadReceipts, setShowReadReceipts] = useState(() => localStorage.getItem('skylineShowReadReceipts') !== 'false');
  const [hideOnlineStatus, setHideOnlineStatus] = useState(user?.hideOnlineStatus ?? false);
  const [hideReadReceipts, setHideReadReceipts] = useState(user?.hideReadReceipts ?? false);
  const [hideDateOfBirth, setHideDateOfBirth] = useState(user?.hideDateOfBirth ?? false);
  const [mediaPreview, setMediaPreview] = useState(() => localStorage.getItem('skylineMediaPreview') !== 'false');
  const [desktopNotifications, setDesktopNotifications] = useState(() => localStorage.getItem('skylineNotifications') === 'true');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const savePreference = (key: string, value: string) => {
    localStorage.setItem(key, value);
    applyAppPreferences(Boolean(user?.isPremium));
  };

  const chooseTheme = (value: 'dark' | 'light') => { setTheme(value); savePreference('skylineTheme', value); };
  const chooseAppTheme = (id: AppTheme) => { setAppTheme(id); savePreference('skylineAppTheme', id); showToast('Стиль приложения обновлён.', 'success'); };

  const handleNotifications = async (enabled: boolean) => {
    if (!enabled) { setDesktopNotifications(false); savePreference('skylineNotifications', 'false'); return; }
    if (!('Notification' in window)) { setNotice('Браузер не поддерживает уведомления.'); return; }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') { setNotice('Разрешите уведомления Skyline в настройках браузера и попробуйте снова.'); return; }
    setNotice(''); setDesktopNotifications(true); savePreference('skylineNotifications', 'true');
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setNotice(choice.outcome === 'accepted' ? 'Skyline установлен.' : 'Установка отменена.');
    setInstallPrompt(null);
  };

  const handleLogout = () => { logout(); navigate('/login', { replace: true }); };

  const savePrivacy = async (updates: { hideOnlineStatus?: boolean; hideReadReceipts?: boolean; hideDateOfBirth?: boolean }) => {
    const next = {
      hideOnlineStatus: updates.hideOnlineStatus ?? hideOnlineStatus,
      hideReadReceipts: updates.hideReadReceipts ?? hideReadReceipts,
      hideDateOfBirth: updates.hideDateOfBirth ?? hideDateOfBirth,
    };
    try {
      await api.patch('/users/me/privacy', next);
      setHideOnlineStatus(next.hideOnlineStatus);
      setHideReadReceipts(next.hideReadReceipts);
      setHideDateOfBirth(next.hideDateOfBirth);
      updateUser(next);
      showToast('Настройки приватности сохранены.', 'success');
    } catch (error) {
      console.error('Не удалось сохранить настройки приватности:', error);
      showToast('Не удалось сохранить настройки приватности.', 'error');
    }
  };

  const cardClass = 'glass-panel rounded-3xl p-5 sm:p-6';

  return (
    <main className="relative h-full overflow-y-auto bg-bg-base px-4 py-6 text-t-primary sm:px-8 sm:py-10 animate-fade-in">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,var(--glow),transparent_55%)]" />
      <div className="relative mx-auto max-w-3xl">
        <button type="button" onClick={() => navigate('/')} className="mb-6 inline-flex min-h-[44px] items-center gap-2 text-xs font-medium text-t-secondary transition hover:text-t-primary">
          <ArrowLeft size={15} /> Назад к чатам
        </button>
        <header className="mb-7">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-accent">Skyline</p>
          <h1 className="text-3xl font-semibold tracking-tight">Настройки</h1>
          <p className="mt-2 text-sm text-t-secondary">Персонализируйте внешний вид, поведение чатов и уведомления.</p>
        </header>

        {notice && <p role="status" className="mb-5 rounded-xl border border-accent/20 bg-accent/[0.08] px-4 py-3 text-sm text-t-primary animate-slide-up">{notice}</p>}

        <div className="space-y-5">
          <section className={cardClass}>
            <div className="mb-3 flex items-center gap-3">
              <Contrast size={18} className="text-accent" />
              <div><h2 className="text-sm font-semibold">Внешний вид</h2><p className="mt-1 text-xs text-t-secondary">Тема, стиль акцентов и плотность интерфейса.</p></div>
            </div>

            <Toggle on={theme === 'light'} onChange={(v) => chooseTheme(v ? 'light' : 'dark')} label="Светлая тема" description="Переключить оформление приложения." />

            <fieldset className="mt-4 border-t border-white/[0.06] pt-4">
              <legend className="mb-3 text-sm font-medium">Стиль приложения</legend>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {APP_THEMES.map((t) => {
                  const active = appTheme === t.id;
                  const [bg, from, to] = THEME_PREVIEW[t.id];
                  return (
                    <button key={t.id} type="button" onClick={() => chooseAppTheme(t.id)} title={`${t.name} — ${t.desc}`}
                      className={`group rounded-2xl border p-2 text-center transition-all duration-200 ${active ? 'border-accent/50 shadow-[0_0_15px_var(--glow)]' : 'border-white/[0.08] hover:border-white/20 hover:-translate-y-0.5'}`}>
                      <span className="mx-auto mb-1.5 block h-9 w-full rounded-xl transition group-hover:brightness-110" style={{ background: `linear-gradient(135deg, ${bg} 30%, ${from} 65%, ${to})` }} />
                      <span className={`block text-[10px] font-medium ${active ? 'text-accent' : 'text-t-secondary'}`}>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-4 border-t border-white/[0.06] pt-4">
              <legend className="mb-3 text-sm font-medium">Размер текста сообщений</legend>
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/[0.07] bg-slate-950/30 p-1.5">
                {([['small', 'Маленький'], ['medium', 'Обычный'], ['large', 'Крупный']] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => { setMessageSize(value); savePreference('skylineMessageSize', value); }}
                    className={`min-h-[44px] rounded-xl text-xs font-semibold transition-all duration-200 ${messageSize === value ? 'bg-gradient-to-r from-accent-from to-accent-to text-white shadow-lg' : 'text-t-secondary hover:bg-white/5'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="mt-2 border-t border-white/[0.06]">
              <Toggle on={compactMode} onChange={(v) => { setCompactMode(v); savePreference('skylineCompactMode', String(v)); }} label="Компактный режим" description="Уменьшить отступы и плотность списков." />
              <Toggle on={reduceMotion} onChange={(v) => { setReduceMotion(v); savePreference('skylineReduceMotion', String(v)); }} label="Уменьшить анимации" description="Отключить плавные переходы и эффекты." />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-1 flex items-center gap-3">
              <MessageSquare size={18} className="text-accent" />
              <div><h2 className="text-sm font-semibold">Чаты</h2><p className="mt-1 text-xs text-t-secondary">Поведение ввода и отображение сообщений.</p></div>
            </div>
            <Toggle on={enterToSend} onChange={(v) => { setEnterToSend(v); savePreference('skylineEnterToSend', String(v)); }} label="Enter — отправить" description="Enter отправляет сообщение, Shift+Enter переносит строку." />
            <Toggle on={showReadReceipts} onChange={(v) => { setShowReadReceipts(v); savePreference('skylineShowReadReceipts', String(v)); }} label="Показывать прочтение" description="Показывать другим отметки о прочтении ваших сообщений." />
            <Toggle on={mediaPreview} onChange={(v) => { setMediaPreview(v); savePreference('skylineMediaPreview', String(v)); }} label="Предпросмотр медиа" description="Открывать изображения во всплывающем просмотре." />
          </section>

          <section className={cardClass}>
            <div className="mb-1 flex items-center gap-3">
              <Shield size={18} className="text-accent" />
              <div><h2 className="text-sm font-semibold">Приватность</h2><p className="mt-1 text-xs text-t-secondary">Кто видит вашу активность.</p></div>
            </div>
            <Toggle on={hideOnlineStatus} onChange={(v) => void savePrivacy({ hideOnlineStatus: v })} label="Скрывать онлайн-статус" description="Другие не увидят, когда вы в сети." />
            <Toggle on={hideReadReceipts} onChange={(v) => void savePrivacy({ hideReadReceipts: v })} label="Скрывать прочтение" description="Отправители не увидят, что вы прочитали сообщение." />
            <Toggle on={hideDateOfBirth} onChange={(v) => void savePrivacy({ hideDateOfBirth: v })} label="Скрывать дату рождения" description="Дата рождения будет видна только вам." />
          </section>

          <section className={cardClass}>
            <div className="mb-1 flex items-center gap-3">
              <Bell size={18} className="text-accent" />
              <div><h2 className="text-sm font-semibold">Уведомления и приложение</h2><p className="mt-1 text-xs text-t-secondary">Push-уведомления и установка.</p></div>
            </div>
            <Toggle on={desktopNotifications} onChange={(v) => void handleNotifications(v)} label="Уведомления о сообщениях" description="Показывать уведомления, когда вкладка не активна." />
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-4">
              {installPrompt && (
                <button type="button" onClick={() => void handleInstall()} className="btn-glow inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent/15 px-4 text-xs font-semibold text-t-primary">
                  <Download size={14} /> Установить Skyline
                </button>
              )}
              <p className="flex items-center gap-2 text-xs text-t-secondary"><Smartphone size={14} /> {user?.email || user?.username}</p>
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-3 flex items-center gap-3">
              <UserRound size={18} className="text-accent" />
              <div><h2 className="text-sm font-semibold">Аккаунт</h2><p className="mt-1 text-xs text-t-secondary">Управление сессией.</p></div>
            </div>
            <button type="button" onClick={handleLogout} className="btn-glow flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-rose-500/15 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/25">
              <LogOut size={16} /> Выйти из аккаунта
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
