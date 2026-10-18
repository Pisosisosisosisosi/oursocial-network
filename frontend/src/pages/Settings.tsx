import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Contrast, Download, LogOut, MessageSquare, Monitor, Shield, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { applyAppPreferences } from '../preferences';
import { api } from '../api/client';
import { useToast } from '../context/useToast';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const cardClass = 'rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6';

function SettingToggle({ checked, onChange, title, description }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-slate-200">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={title}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101725] ${checked ? 'border-indigo-400/60 bg-indigo-500' : 'border-white/10 bg-slate-700'}`}
      >
        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const showToast = useToast();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('pulseTheme') === 'light' ? 'light' : 'dark');
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('pulseCompactMode') === 'true');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('pulseReduceMotion') === 'true');
  const [messageSize, setMessageSize] = useState(() => localStorage.getItem('pulseMessageSize') || 'medium');
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem('pulseEnterToSend') !== 'false');
  const [showReadReceipts, setShowReadReceipts] = useState(() => localStorage.getItem('pulseShowReadReceipts') !== 'false');
  const [hideOnlineStatus, setHideOnlineStatus] = useState(user?.hideOnlineStatus ?? false);
  const [hideReadReceipts, setHideReadReceipts] = useState(user?.hideReadReceipts ?? false);
  const [hideDateOfBirth, setHideDateOfBirth] = useState(user?.hideDateOfBirth ?? false);
  const [mediaPreview, setMediaPreview] = useState(() => localStorage.getItem('pulseMediaPreview') !== 'false');
  const [desktopNotifications, setDesktopNotifications] = useState(() => localStorage.getItem('pulseNotifications') === 'true');
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  const savePreference = (key: string, value: string) => {
    localStorage.setItem(key, value);
    applyAppPreferences(Boolean(user?.isPremium));
  };

  const chooseTheme = (value: 'dark' | 'light') => {
    setTheme(value);
    savePreference('pulseTheme', value);
  };

  const handleNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setDesktopNotifications(false);
      savePreference('pulseNotifications', 'false');
      return;
    }
    if (!('Notification' in window)) {
      setNotice('Браузер не поддерживает уведомления.');
      return;
    }
    const permission = Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
    if (permission !== 'granted') {
      setNotice('Разрешите уведомления Pulse в настройках браузера и попробуйте снова.');
      return;
    }
    setNotice('');
    setDesktopNotifications(true);
    savePreference('pulseNotifications', 'true');
  };

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setNotice(choice.outcome === 'accepted' ? 'Pulse установлен.' : 'Установка отменена.');
    setInstallPrompt(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

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

  return (
    <main className="relative h-full overflow-y-auto bg-[#090d16] px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(99,102,241,0.13),transparent_55%)]" />
      <div className="relative mx-auto max-w-3xl">
        <button type="button" onClick={() => navigate('/')} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-200">
          <ArrowLeft size={15} /> Назад к чатам
        </button>
        <header className="mb-7">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-indigo-300">Pulse</p>
          <h1 className="text-3xl font-semibold tracking-tight">Настройки</h1>
          <p className="mt-2 text-sm text-slate-500">Персонализируйте внешний вид, поведение чатов и уведомления.</p>
        </header>

        {notice && <p role="status" className="mb-5 rounded-xl border border-indigo-400/20 bg-indigo-400/[0.08] px-4 py-3 text-sm text-indigo-200">{notice}</p>}

        <div className="space-y-5">
          <section className={cardClass}>
            <div className="mb-3 flex items-center gap-3">
              <Contrast size={18} className="text-indigo-300" />
              <div><h2 className="text-sm font-semibold">Внешний вид</h2><p className="mt-1 text-xs text-slate-500">Настройте тему и плотность интерфейса.</p></div>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Светлая тема</p>
                <p className="mt-1 text-xs text-slate-500">Переключить оформление приложения.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={theme === 'light'}
                aria-label="Светлая тема"
                onClick={() => chooseTheme(theme === 'dark' ? 'light' : 'dark')}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#101725] ${theme === 'light' ? 'border-indigo-400/60 bg-indigo-500' : 'border-white/10 bg-slate-700'}`}
              >
                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${theme === 'light' ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
            </div>
            <fieldset className="border-t border-white/[0.06] py-4">
              <legend className="mb-3 text-sm font-medium text-slate-200">Размер текста сообщений</legend>
              <div className="grid grid-cols-3 gap-2 rounded-2xl border border-white/[0.07] bg-slate-950/30 p-1.5">
                {([
                  ['small', 'Маленький'],
                  ['medium', 'Обычный'],
                  ['large', 'Крупный'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={messageSize === value}
                    onClick={() => { setMessageSize(value); savePreference('pulseMessageSize', value); }}
                    className={`min-h-10 rounded-xl px-2 text-xs font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${messageSize === value ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <SettingToggle checked={compactMode} onChange={(enabled) => { setCompactMode(enabled); savePreference('pulseCompactMode', String(enabled)); }} title="Компактный интерфейс" description="Уменьшает отступы в списке диалогов и истории сообщений." />
              <SettingToggle checked={reduceMotion} onChange={(enabled) => { setReduceMotion(enabled); savePreference('pulseReduceMotion', String(enabled)); }} title="Уменьшить анимацию" description="Отключает декоративные переходы и анимации интерфейса." />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-2 flex items-center gap-3">
              <MessageSquare size={18} className="text-cyan-300" />
              <div><h2 className="text-sm font-semibold">Чаты и сообщения</h2><p className="mt-1 text-xs text-slate-500">Поведение ввода, квитанций и вложений.</p></div>
            </div>
            <div className="divide-y divide-white/[0.06]">
              <SettingToggle checked={enterToSend} onChange={(enabled) => { setEnterToSend(enabled); savePreference('pulseEnterToSend', String(enabled)); }} title="Enter отправляет сообщение" description="При выключении Enter создаёт новую строку, а отправка выполняется кнопкой." />
              <SettingToggle checked={showReadReceipts} onChange={(enabled) => { setShowReadReceipts(enabled); savePreference('pulseShowReadReceipts', String(enabled)); }} title="Показывать отметки прочтения" description="Включает или скрывает ваши галочки рядом со временем отправки на этом устройстве." />
              <SettingToggle checked={mediaPreview} onChange={(enabled) => { setMediaPreview(enabled); savePreference('pulseMediaPreview', String(enabled)); }} title="Предпросмотр изображений" description="Показывать изображения прямо в переписке; при отключении останется ссылка на файл." />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-2 flex items-center gap-3">
              <Bell size={18} className="text-amber-300" />
              <div><h2 className="text-sm font-semibold">Уведомления</h2><p className="mt-1 text-xs text-slate-500">Уведомления браузера работают, когда вкладка не активна.</p></div>
            </div>
            <SettingToggle checked={desktopNotifications} onChange={(enabled) => void handleNotifications(enabled)} title="Уведомления на рабочем столе" description="Разрешить браузеру показывать уведомления о новых сообщениях." />
            {typeof Notification !== 'undefined' && <p className="border-t border-white/[0.06] pt-3 text-[11px] text-slate-600">Разрешение браузера: {Notification.permission === 'granted' ? 'разрешено' : Notification.permission === 'denied' ? 'запрещено' : 'не запрошено'}.</p>}
          </section>

          <section className={cardClass}>
            <div className="mb-3 flex items-center gap-3">
              <Shield size={18} className="text-emerald-300" />
              <div><h2 className="text-sm font-semibold">Профиль и приватность</h2><p className="mt-1 text-xs text-slate-500">Публичная информация, дата рождения и время последнего посещения.</p></div>
            </div>
            <button type="button" onClick={() => navigate('/profile')} className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] px-4 py-3 text-left transition hover:bg-white/[0.04]">
              <span className="flex items-center gap-3"><UserRound size={17} className="text-slate-400" /><span><span className="block text-sm text-slate-200">Настройки профиля</span><span className="mt-1 block text-xs text-slate-500">Имя, username, аватар, описание и last seen</span></span></span>
              <ArrowLeft size={15} className="rotate-180 text-slate-500" />
            </button>
            <div className="mt-3 divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <SettingToggle checked={hideOnlineStatus} onChange={(enabled) => void savePrivacy({ hideOnlineStatus: enabled })} title="Скрыть статус онлайн" description="Другие пользователи не будут видеть вашу зелёную точку присутствия." />
              <SettingToggle checked={hideDateOfBirth} onChange={(enabled) => void savePrivacy({ hideDateOfBirth: enabled })} title="Скрыть дату рождения" description="Скрыть дату рождения в публичном профиле. Она останется видна только вам." />
              <SettingToggle checked={hideReadReceipts} onChange={(enabled) => void savePrivacy({ hideReadReceipts: enabled })} title="Скрыть отметки о прочтении" description="Сообщения не будут отмечаться прочитанными, пока настройка включена." />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-3 flex items-center gap-3">
              <Smartphone size={18} className="text-violet-300" />
              <div><h2 className="text-sm font-semibold">Приложение</h2><p className="mt-1 text-xs text-slate-500">Установка Pulse на устройство и работа без сети.</p></div>
            </div>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div><p className="text-sm text-slate-200">Установить Pulse</p><p className="mt-1 text-xs text-slate-500">Добавьте мессенджер на главный экран устройства.</p></div>
              <button type="button" disabled={!installPrompt} onClick={() => void handleInstall()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
                <Download size={15} /> {installPrompt ? 'Установить' : 'Откройте меню браузера для установки'}
              </button>
            </div>
            <p className="mt-3 flex items-center gap-2 text-[11px] text-slate-600"><Monitor size={13} /> Для офлайн-режима ранее загруженная оболочка доступна без подключения; синхронизация сообщений требует сети.</p>
          </section>

          <section className={`${cardClass} flex flex-col justify-between gap-4 border-rose-400/10 sm:flex-row sm:items-center`}>
            <div><h2 className="text-sm font-semibold">Аккаунт</h2><p className="mt-1 text-xs text-slate-500">Вы вошли как @{user?.username || 'пользователь'}.</p></div>
            <button type="button" onClick={handleLogout} className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-400/20 px-4 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10">
              <LogOut size={15} /> Выйти из аккаунта
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}
