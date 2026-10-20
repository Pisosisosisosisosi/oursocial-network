import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowLeft, Bell, Contrast, Download, Image, LogOut, MessageSquare, Shield, Smartphone, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { applyAppPreferences, APP_THEMES, CHAT_STYLE_DEFAULTS, type AppTheme, type WallpaperFit } from '../preferences';
import { api } from '../api/client';
import { useToast } from '../context/useToast';
//import GlassPanel from '../components/ui/GlassPanel';
import Toggle from '../components/ui/Toggle';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function readChatColorPreference(key: string, fallback: string) {
  const value = localStorage.getItem(key);
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function readChatWallpaper() {
  const value = localStorage.getItem('skylineChatWallpaper') || '';
  return value.length <= 2_200_000 && /^data:image\/(?:png|jpeg|webp|gif);base64,[\da-z+/]+=*$/i.test(value) ? value : '';
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

const CHAT_PALETTES = [
  { id: 'skyline', name: 'Skyline', note: 'Индиго и графит', text: '#f8fafc', border: '#475569', own: '#4f46e5', other: '#1e293b' },
  { id: 'lavender', name: 'Лаванда', note: 'Мягкий фиолетовый', text: '#f5f3ff', border: '#8b5cf6', own: '#7c3aed', other: '#312e81' },
  { id: 'mint', name: 'Мята', note: 'Свежий зелёный', text: '#ecfdf5', border: '#34d399', own: '#059669', other: '#064e3b' },
  { id: 'sunset', name: 'Закат', note: 'Тёплый коралловый', text: '#fff7ed', border: '#fb923c', own: '#ea580c', other: '#431407' },
  { id: 'rose', name: 'Розовый кварц', note: 'Яркий и нежный', text: '#fff1f2', border: '#fb7185', own: '#e11d48', other: '#4c0519' },
  { id: 'ice', name: 'Лёд', note: 'Чистый голубой', text: '#f0f9ff', border: '#38bdf8', own: '#0284c7', other: '#0c4a6e' },
  { id: 'mono', name: 'Монохром', note: 'Сдержанная классика', text: '#f8fafc', border: '#94a3b8', own: '#475569', other: '#1e293b' },
  { id: 'berry', name: 'Ягода', note: 'Глубокий малиновый', text: '#fff1f2', border: '#c084fc', own: '#a21caf', other: '#3b0764' },
] as const;

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
  const wallpaperInputRef = useRef<HTMLInputElement>(null);
  const [wallpaper, setWallpaper] = useState(readChatWallpaper);
  const [wallpaperFit, setWallpaperFit] = useState<WallpaperFit>(() => {
    const saved = localStorage.getItem('skylineChatWallpaperFit');
    return saved === 'contain' || saved === 'repeat' ? saved : 'cover';
  });
  const [chatTextColor, setChatTextColor] = useState(() => readChatColorPreference('skylineChatTextColor', CHAT_STYLE_DEFAULTS.text));
  const [chatBorderColor, setChatBorderColor] = useState(() => readChatColorPreference('skylineChatBorderColor', CHAT_STYLE_DEFAULTS.border));
  const [ownMessageColor, setOwnMessageColor] = useState(() => readChatColorPreference('skylineChatOwnMessageColor', CHAT_STYLE_DEFAULTS.ownMessage));
  const [otherMessageColor, setOtherMessageColor] = useState(() => readChatColorPreference('skylineChatOtherMessageColor', CHAT_STYLE_DEFAULTS.otherMessage));
  const [bubbleStyle, setBubbleStyle] = useState(() => ['outlined', 'glass'].includes(localStorage.getItem('skylineChatBubbleStyle') || '') ? localStorage.getItem('skylineChatBubbleStyle')! : 'soft');
  const [textStyle, setTextStyle] = useState(() => ['glow', 'bold'].includes(localStorage.getItem('skylineChatTextStyle') || '') ? localStorage.getItem('skylineChatTextStyle')! : 'normal');

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

  const handleWallpaperUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setNotice('Выберите изображение JPG, PNG, WebP или GIF.');
      return;
    }
    if (file.size > 1_500_000) {
      setNotice('Размер изображения не должен превышать 1,5 МБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      try {
        localStorage.setItem('skylineChatWallpaper', reader.result);
        setWallpaper(reader.result);
        setNotice('Обои чата обновлены.');
        applyAppPreferences(Boolean(user?.isPremium));
      } catch {
        setNotice('Не удалось сохранить изображение. Выберите файл меньшего размера.');
      }
    };
    reader.onerror = () => setNotice('Не удалось прочитать изображение.');
    reader.readAsDataURL(file);
  };

  const chooseWallpaperFit = (fit: WallpaperFit) => {
    setWallpaperFit(fit);
    savePreference('skylineChatWallpaperFit', fit);
  };

  const resetChatStyle = () => {
    ['skylineChatWallpaper', 'skylineChatWallpaperFit', 'skylineChatTextColor', 'skylineChatBorderColor', 'skylineChatOwnMessageColor', 'skylineChatOtherMessageColor', 'skylineChatBubbleStyle', 'skylineChatTextStyle'].forEach((key) => localStorage.removeItem(key));
    setWallpaper('');
    setWallpaperFit('cover');
    setChatTextColor(CHAT_STYLE_DEFAULTS.text);
    setChatBorderColor(CHAT_STYLE_DEFAULTS.border);
    setOwnMessageColor(CHAT_STYLE_DEFAULTS.ownMessage);
    setOtherMessageColor(CHAT_STYLE_DEFAULTS.otherMessage);
    setBubbleStyle('soft');
    setTextStyle('normal');
    applyAppPreferences(Boolean(user?.isPremium));
  };

  const chooseChatColor = (key: string, value: string, setValue: (value: string) => void) => {
    setValue(value);
    savePreference(key, value);
  };

  const chooseChatPalette = (palette: typeof CHAT_PALETTES[number]) => {
    setChatTextColor(palette.text);
    setChatBorderColor(palette.border);
    setOwnMessageColor(palette.own);
    setOtherMessageColor(palette.other);
    localStorage.setItem('skylineChatTextColor', palette.text);
    localStorage.setItem('skylineChatBorderColor', palette.border);
    localStorage.setItem('skylineChatOwnMessageColor', palette.own);
    localStorage.setItem('skylineChatOtherMessageColor', palette.other);
    applyAppPreferences(Boolean(user?.isPremium));
    showToast(`Сочетание «${palette.name}» применено.`, 'success');
  };

  const chooseChatStyle = (key: 'skylineChatBubbleStyle' | 'skylineChatTextStyle', value: string, setter: (value: string) => void) => {
    setter(value);
    savePreference(key, value);
  };

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

            <fieldset className="mt-4 border-t border-white/[0.06] pt-4">
              <legend className="mb-3 flex items-center gap-2 text-sm font-medium"><Image size={15} className="text-accent" /> Оформление чатов</legend>
              <div className="mb-4">
                <div className="mb-2 flex items-end justify-between gap-3">
                  <div><p className="text-xs font-semibold text-t-primary">Готовые сочетания</p><p className="mt-0.5 text-[10px] text-t-secondary">Палитра сразу подберёт фон и обводку сообщений.</p></div>
                  {CHAT_PALETTES.some((p) => p.text === chatTextColor && p.border === chatBorderColor && p.own === ownMessageColor && p.other === otherMessageColor) && <span className="rounded-full bg-accent/10 px-2 py-1 text-[9px] font-semibold text-accent">Тема выбрана</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {CHAT_PALETTES.map((palette) => {
                    const active = palette.text === chatTextColor && palette.border === chatBorderColor && palette.own === ownMessageColor && palette.other === otherMessageColor;
                    return <button key={palette.id} type="button" onClick={() => chooseChatPalette(palette)} aria-pressed={active}
                      className={`group min-h-[82px] rounded-2xl border p-2.5 text-left transition-all hover:-translate-y-0.5 ${active ? 'border-accent/60 bg-accent/[0.08] shadow-[0_0_18px_var(--glow)]' : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.045]'}`}>
                      <span className="mb-2 flex h-6 items-center gap-1.5 rounded-lg px-1.5" style={{ background: palette.other, border: `1px solid ${palette.border}` }}>
                        <i className="h-2 w-2 rounded-full" style={{ backgroundColor: palette.border }} />
                        <i className="h-2 w-7 rounded-full" style={{ backgroundColor: palette.text, opacity: .9 }} />
                        <i className="ml-auto h-2 w-5 rounded-full" style={{ backgroundColor: palette.own }} />
                      </span>
                      <span className={`block text-[11px] font-semibold ${active ? 'text-accent' : 'text-t-primary'}`}>{palette.name}</span>
                      <span className="mt-0.5 block text-[9px] text-t-secondary">{palette.note}</span>
                    </button>;
                  })}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-[1fr_1fr]">
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => wallpaperInputRef.current?.click()} className="min-h-10 rounded-xl bg-accent/15 px-3 text-xs font-semibold text-t-primary hover:bg-accent/25">Загрузить обои</button>
                    {wallpaper && <button type="button" onClick={() => { localStorage.removeItem('skylineChatWallpaper'); setWallpaper(''); applyAppPreferences(Boolean(user?.isPremium)); }} className="min-h-10 rounded-xl border border-white/10 px-3 text-xs text-t-secondary hover:bg-white/5">Убрать</button>}
                    <input ref={wallpaperInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleWallpaperUpload} className="hidden" aria-label="Загрузить обои чата" />
                  </div>
                  <p className="text-[10px] leading-relaxed text-t-secondary">JPG, PNG, WebP или GIF · до 1,5 МБ. Изображение хранится в этом браузере.</p>
                  <label className="block text-xs text-t-secondary">Размещение изображения
                    <select value={wallpaperFit} onChange={(event) => chooseWallpaperFit(event.target.value as WallpaperFit)} className="mt-1.5 h-10 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 text-xs text-t-primary outline-none focus:border-accent/50">
                      <option value="cover">Заполнить область</option><option value="contain">Вписать целиком</option><option value="repeat">Повторять плиткой</option>
                    </select>
                  </label>
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-t-secondary">Точная настройка</p>
                  {[
                    { label: 'Цвет текста сообщений', value: chatTextColor, key: 'skylineChatTextColor', set: setChatTextColor },
                    { label: 'Цвет обводки сообщений', value: chatBorderColor, key: 'skylineChatBorderColor', set: setChatBorderColor },
                    { label: 'Цвет моих сообщений', value: ownMessageColor, key: 'skylineChatOwnMessageColor', set: setOwnMessageColor },
                    { label: 'Цвет сообщений собеседника', value: otherMessageColor, key: 'skylineChatOtherMessageColor', set: setOtherMessageColor },
                  ].map((color) => <label key={color.key} className="flex min-h-10 items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 text-[11px] text-t-secondary">{color.label}<input type="color" value={color.value} onChange={(event) => chooseChatColor(color.key, event.target.value, color.set)} aria-label={color.label} className="h-7 w-9 cursor-pointer rounded-md border-0 bg-transparent p-0" /></label>)}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <fieldset>
                  <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-t-secondary">Форма сообщений</legend>
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-slate-950/30 p-1">
                    {([['soft', 'Мягкая'], ['outlined', 'Контур'], ['glass', 'Стекло']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={bubbleStyle === value} onClick={() => chooseChatStyle('skylineChatBubbleStyle', value, setBubbleStyle)} className={`min-h-9 rounded-lg px-1 text-[10px] font-semibold transition ${bubbleStyle === value ? 'bg-accent/20 text-accent shadow-sm' : 'text-t-secondary hover:bg-white/5'}`}>{label}</button>)}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-t-secondary">Характер текста</legend>
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-white/[0.07] bg-slate-950/30 p-1">
                    {([['normal', 'Чистый'], ['bold', 'Выразительный'], ['glow', 'Сияние']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={textStyle === value} onClick={() => chooseChatStyle('skylineChatTextStyle', value, setTextStyle)} className={`min-h-9 rounded-lg px-1 text-[10px] font-semibold transition ${textStyle === value ? 'bg-accent/20 text-accent shadow-sm' : 'text-t-secondary hover:bg-white/5'}`}>{label}</button>)}
                  </div>
                </fieldset>
              </div>
              <div className="mt-4 rounded-2xl border border-white/[0.07] p-3" style={{ backgroundColor: '#0b1020', backgroundImage: wallpaper ? `linear-gradient(rgba(4,8,16,.38),rgba(4,8,16,.38)),url("${wallpaper}")` : undefined, backgroundSize: wallpaperFit === 'repeat' ? 'cover,180px auto' : `cover,${wallpaperFit}`, backgroundRepeat: wallpaperFit === 'repeat' ? 'no-repeat,repeat' : 'no-repeat,no-repeat', backgroundPosition: 'center' }}>
                <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-white/60">Предпросмотр</p>
                <div className="flex flex-col gap-2">
                  <div className="chat-message-bubble chat-message-other max-w-[85%] self-start rounded-2xl rounded-bl-md border px-3 py-2 text-xs" style={{ borderColor: chatBorderColor, color: chatTextColor }}>Привет! Вот так выглядят сообщения.</div>
                  <div className="chat-message-bubble chat-message-own max-w-[85%] self-end rounded-2xl rounded-br-md border px-3 py-2 text-xs" style={{ borderColor: chatBorderColor, color: chatTextColor }}>Можно настроить под себя ✨</div>
                </div>
              </div>
              <button type="button" onClick={resetChatStyle} className="mt-3 min-h-9 rounded-lg px-2 text-[11px] text-t-secondary hover:bg-white/5 hover:text-t-primary">Сбросить оформление чатов</button>
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
