export const APP_THEMES = [
  { id: 'skyline', name: 'Skyline', desc: 'Индиго → изумруд (по умолчанию)' },
  { id: 'cyber', name: 'Киберпанк', desc: 'Неоновый циан → фиолетовый' },
  { id: 'cosmos', name: 'Космос', desc: 'Глубокий фиолет → розовый' },
  { id: 'sakura', name: 'Сакура', desc: 'Нежно-розовый' },
  { id: 'midnight', name: 'Полночь', desc: 'Тёмно-синий → голубой' },
  { id: 'ocean', name: 'Океан', desc: 'Бирюзово-глубокий' },
  { id: 'sunset', name: 'Закат', desc: 'Оранжево-красный' },
  { id: 'forest', name: 'Лес', desc: 'Глубокая зелень' },
  { id: 'royal', name: 'Роскошь', desc: 'Золотой градиент' },
  { id: 'rose', name: 'Роза', desc: 'Тёплый розово-рубиновый' },
  { id: 'violet', name: 'Фиалка', desc: 'Светло-фиолетовый' },
  { id: 'mono', name: 'Монохром', desc: 'Строгий серый' },
  { id: 'matrix', name: 'Матрица', desc: 'Неоновая зелень' },
  { id: 'arctic', name: 'Арктика', desc: 'Ледяной голубой' },
  { id: 'mocha', name: 'Мокко', desc: 'Тёплый кофейный' },
  { id: 'aurora', name: 'Северное сияние', desc: 'Бирюза и небесный фиолет' },
  { id: 'lagoon', name: 'Лагуна', desc: 'Свежий морской бриз' },
  { id: 'crimson', name: 'Рубин', desc: 'Глубокий красный и гранат' },
  { id: 'candy', name: 'Конфета', desc: 'Яркая фуксия и голубой' },
  { id: 'cobalt', name: 'Кобальт', desc: 'Насыщенный синий и лёд' },
  { id: 'copper', name: 'Медь', desc: 'Тёплая медь и песок' },
  { id: 'lavender', name: 'Лавандовое поле', desc: 'Спокойный сиреневый' },
  { id: 'glacier', name: 'Ледник', desc: 'Холодная бирюза и индиго' },
  { id: 'ember', name: 'Уголь и пламя', desc: 'Контрастный огненный акцент' },
  { id: 'jade', name: 'Нефрит', desc: 'Глубокий зелёный и мята' },
  { id: 'orchid', name: 'Орхидея', desc: 'Пурпурный и розовый' },
  { id: 'sand', name: 'Песчаный берег', desc: 'Мягкие янтарные оттенки' },
] as const;
export type AppTheme = typeof APP_THEMES[number]['id'];

export const CHAT_STYLE_DEFAULTS = {
  text: '#f8fafc',
  border: '#475569',
  ownMessage: '#4f46e5',
  otherMessage: '#1e293b',
} as const;

export type WallpaperFit = 'cover' | 'contain' | 'repeat';

const WALLPAPER_DB = 'skyline-preferences';
const WALLPAPER_STORE = 'images';
const WALLPAPER_KEY = 'chat-wallpaper';
let wallpaperObjectUrl: string | null = null;
let wallpaperApplyRevision = 0;

function openWallpaperDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WALLPAPER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(WALLPAPER_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Не удалось открыть хранилище обоев.'));
  });
}

function writeWallpaperBlob(db: IDBDatabase, blob: Blob | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(WALLPAPER_STORE, 'readwrite');
    const store = transaction.objectStore(WALLPAPER_STORE);
    if (blob) store.put(blob, WALLPAPER_KEY);
    else store.delete(WALLPAPER_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Не удалось сохранить обои.'));
    transaction.onabort = () => reject(transaction.error || new Error('Сохранение обоев отменено.'));
  });
}

export async function storeChatWallpaper(file: Blob | null): Promise<string> {
  const db = await openWallpaperDatabase();
  try {
    await writeWallpaperBlob(db, file);
  } finally {
    db.close();
  }

  localStorage.removeItem('skylineChatWallpaper');
  if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl);
  wallpaperObjectUrl = file ? URL.createObjectURL(file) : null;
  wallpaperApplyRevision += 1;
  return wallpaperObjectUrl || '';
}

export async function getStoredChatWallpaperUrl(): Promise<string> {
  if (wallpaperObjectUrl) return wallpaperObjectUrl;
  try {
    const db = await openWallpaperDatabase();
    let blob: Blob | undefined;
    try {
      blob = await new Promise<Blob | undefined>((resolve, reject) => {
        const request = db.transaction(WALLPAPER_STORE, 'readonly').objectStore(WALLPAPER_STORE).get(WALLPAPER_KEY);
        request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : undefined);
        request.onerror = () => reject(request.error || new Error('Не удалось загрузить обои.'));
      });
    } finally {
      db.close();
    }
    if (blob) {
      wallpaperObjectUrl = URL.createObjectURL(blob);
      return wallpaperObjectUrl;
    }
  } catch (error) {
    console.warn('Не удалось прочитать обои чата из локального хранилища:', error);
  }

  const legacyWallpaper = localStorage.getItem('skylineChatWallpaper') || '';
  return legacyWallpaper.length <= 7_000_000
    && /^data:image\/(?:png|jpeg|webp|gif);base64,[\da-z+/]+=*$/i.test(legacyWallpaper)
    ? legacyWallpaper
    : '';
}

function readColorPreference(key: string, fallback: string) {
  const value = localStorage.getItem(key);
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function applyChatPreferences(root: HTMLElement) {
  root.style.setProperty('--chat-text-color', readColorPreference('skylineChatTextColor', CHAT_STYLE_DEFAULTS.text));
  root.style.setProperty('--chat-border-color', readColorPreference('skylineChatBorderColor', CHAT_STYLE_DEFAULTS.border));
  root.style.setProperty('--chat-own-message-color', readColorPreference('skylineChatOwnMessageColor', CHAT_STYLE_DEFAULTS.ownMessage));
  root.style.setProperty('--chat-other-message-color', readColorPreference('skylineChatOtherMessageColor', CHAT_STYLE_DEFAULTS.otherMessage));

  const fit = localStorage.getItem('skylineChatWallpaperFit');
  const wallpaperFit: WallpaperFit = fit === 'contain' || fit === 'repeat' ? fit : 'cover';
  const revision = ++wallpaperApplyRevision;
  root.style.setProperty('--chat-wallpaper-image', 'none');
  root.style.setProperty('--chat-wallpaper-shade', 'transparent');
  root.style.setProperty('--chat-wallpaper-size', wallpaperFit === 'repeat' ? '180px auto' : wallpaperFit);
  root.style.setProperty('--chat-wallpaper-repeat', wallpaperFit === 'repeat' ? 'repeat' : 'no-repeat');
  void getStoredChatWallpaperUrl().then((wallpaper) => {
    if (revision !== wallpaperApplyRevision || !root.isConnected) return;
    root.style.setProperty('--chat-wallpaper-image', wallpaper ? `url("${wallpaper}")` : 'none');
    const wallpaperShade = root.dataset.theme === 'light' ? 'rgba(255, 255, 255, 0.32)' : 'rgba(4, 8, 16, 0.38)';
    root.style.setProperty('--chat-wallpaper-shade', wallpaper ? wallpaperShade : 'transparent');
  });
}

export function applyAppPreferences(isPremium = false) {
  const root = document.documentElement;
  root.dataset.theme = localStorage.getItem('skylineTheme') === 'light' ? 'light' : 'dark';
  const appTheme = localStorage.getItem('skylineAppTheme');
  root.dataset.appTheme = APP_THEMES.some((t) => t.id === appTheme) ? appTheme! : 'skyline';
  const premiumTheme = localStorage.getItem('skylinePremiumTheme');
  root.dataset.premiumTheme = isPremium && ['cyber', 'cosmos', 'sakura'].includes(premiumTheme || '')
    ? premiumTheme!
    : 'default';
  root.dataset.compact = localStorage.getItem('skylineCompactMode') === 'true' ? 'true' : 'false';
  root.dataset.reduceMotion = localStorage.getItem('skylineReduceMotion') === 'true' ? 'true' : 'false';
  const messageSize = localStorage.getItem('skylineMessageSize');
  root.dataset.messageSize = messageSize === 'small' || messageSize === 'large' ? messageSize : 'medium';
  const bubbleStyle = localStorage.getItem('skylineChatBubbleStyle');
  root.dataset.chatBubbleStyle = bubbleStyle === 'outlined' || bubbleStyle === 'glass' ? bubbleStyle : 'soft';
  const textStyle = localStorage.getItem('skylineChatTextStyle');
  root.dataset.chatTextStyle = textStyle === 'glow' || textStyle === 'bold' ? textStyle : 'normal';
  applyChatPreferences(root);
  root.style.colorScheme = root.dataset.theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = root.dataset.theme === 'light' ? '#f3f6fb' : '#090d16';
}
