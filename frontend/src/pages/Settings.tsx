import { useEffect, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Bell, Check, Contrast, Download, LogOut, MessageSquare, Monitor, Moon, Shield, Smartphone, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { applyAppPreferences } from '../preferences';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const cardClass = 'rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6';
const toggleClass = 'h-4 w-4 accent-indigo-500';

function SettingToggle({ checked, onChange, title, description }: {
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  title: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block text-sm font-medium text-slate-200">{title}</span>
        <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={onChange} className={`${toggleClass} mt-1 shrink-0`} />
    </label>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('pulseTheme') === 'light' ? 'light' : 'dark');
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('pulseCompactMode') === 'true');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('pulseReduceMotion') === 'true');
  const [messageSize, setMessageSize] = useState(() => localStorage.getItem('pulseMessageSize') || 'medium');
  const [enterToSend, setEnterToSend] = useState(() => localStorage.getItem('pulseEnterToSend') !== 'false');
  const [showReadReceipts, setShowReadReceipts] = useState(() => localStorage.getItem('pulseShowReadReceipts') !== 'false');
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
    applyAppPreferences();
  };

  const chooseTheme = (value: 'dark' | 'light') => {
    setTheme(value);
    savePreference('pulseTheme', value);
  };

  const handleNotifications = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.checked) {
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
            <div className="grid grid-cols-2 gap-3 py-3">
              <button type="button" onClick={() => chooseTheme('dark')} aria-pressed={theme === 'dark'} className={`flex items-center justify-between rounded-xl border p-3 text-sm transition ${theme === 'dark' ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-200' : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04]'}`}>
                <span className="flex items-center gap-2"><Moon size={16} /> Тёмная</span>{theme === 'dark' && <Check size={15} />}
              </button>
              <button type="button" onClick={() => chooseTheme('light')} aria-pressed={theme === 'light'} className={`flex items-center justify-between rounded-xl border p-3 text-sm transition ${theme === 'light' ? 'border-indigo-400/50 bg-indigo-500/10 text-indigo-200' : 'border-white/[0.08] text-slate-400 hover:bg-white/[0.04]'}`}>
                <span className="flex items-center gap-2"><Sun size={16} /> Светлая</span>{theme === 'light' && <Check size={15} />}
              </button>
            </div>
            <label className="flex items-center justify-between gap-4 border-t border-white/[0.06] py-4 text-sm text-slate-200">
              Размер текста сообщений
              <select value={messageSize} onChange={(event) => { setMessageSize(event.target.value); savePreference('pulseMessageSize', event.target.value); }} className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-xs text-slate-200">
                <option value="small">Маленький</option><option value="medium">Обычный</option><option value="large">Крупный</option>
              </select>
            </label>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              <SettingToggle checked={compactMode} onChange={(event) => { setCompactMode(event.target.checked); savePreference('pulseCompactMode', String(event.target.checked)); }} title="Компактный интерфейс" description="Уменьшает отступы в списке диалогов и истории сообщений." />
              <SettingToggle checked={reduceMotion} onChange={(event) => { setReduceMotion(event.target.checked); savePreference('pulseReduceMotion', String(event.target.checked)); }} title="Уменьшить анимацию" description="Отключает декоративные переходы и анимации интерфейса." />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-2 flex items-center gap-3">
              <MessageSquare size={18} className="text-cyan-300" />
              <div><h2 className="text-sm font-semibold">Чаты и сообщения</h2><p className="mt-1 text-xs text-slate-500">Поведение ввода, квитанций и вложений.</p></div>
            </div>
            <div className="divide-y divide-white/[0.06]">
              <SettingToggle checked={enterToSend} onChange={(event) => { setEnterToSend(event.target.checked); savePreference('pulseEnterToSend', String(event.target.checked)); }} title="Enter отправляет сообщение" description="При выключении Enter создаёт новую строку, а отправка выполняется кнопкой." />
              <SettingToggle checked={showReadReceipts} onChange={(event) => { setShowReadReceipts(event.target.checked); savePreference('pulseShowReadReceipts', String(event.target.checked)); }} title="Показывать отметки прочтения" description="Включает или скрывает ваши галочки рядом со временем отправки." />
              <SettingToggle checked={mediaPreview} onChange={(event) => { setMediaPreview(event.target.checked); savePreference('pulseMediaPreview', String(event.target.checked)); }} title="Предпросмотр изображений" description="Показывать изображения прямо в переписке; при отключении останется ссылка на файл." />
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-2 flex items-center gap-3">
              <Bell size={18} className="text-amber-300" />
              <div><h2 className="text-sm font-semibold">Уведомления</h2><p className="mt-1 text-xs text-slate-500">Уведомления браузера работают, когда вкладка не активна.</p></div>
            </div>
            <SettingToggle checked={desktopNotifications} onChange={(event) => void handleNotifications(event)} title="Уведомления на рабочем столе" description="Разрешить браузеру показывать уведомления о новых сообщениях." />
            {typeof Notification !== 'undefined' && <p className="border-t border-white/[0.06] pt-3 text-[11px] text-slate-600">Разрешение браузера: {Notification.permission === 'granted' ? 'разрешено' : Notification.permission === 'denied' ? 'запрещено' : 'не запрошено'}.</p>}
          </section>

          <section className={cardClass}>
            <div className="mb-3 flex items-center gap-3">
              <Shield size={18} className="text-emerald-300" />
              <div><h2 className="text-sm font-semibold">Профиль и приватность</h2><p className="mt-1 text-xs text-slate-500">Публичная информация и видимость последнего посещения.</p></div>
            </div>
            <button type="button" onClick={() => navigate('/profile')} className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] px-4 py-3 text-left transition hover:bg-white/[0.04]">
              <span className="flex items-center gap-3"><UserRound size={17} className="text-slate-400" /><span><span className="block text-sm text-slate-200">Настройки профиля</span><span className="mt-1 block text-xs text-slate-500">Имя, username, аватар, описание и last seen</span></span></span>
              <ArrowLeft size={15} className="rotate-180 text-slate-500" />
            </button>
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
