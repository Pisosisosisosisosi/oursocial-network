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
] as const;
export type AppTheme = typeof APP_THEMES[number]['id'];

export const CHAT_STYLE_DEFAULTS = {
  text: '#f8fafc',
  border: '#475569',
  ownMessage: '#4f46e5',
  otherMessage: '#1e293b',
} as const;

export type WallpaperFit = 'cover' | 'contain' | 'repeat';

function readColorPreference(key: string, fallback: string) {
  const value = localStorage.getItem(key);
  return value && /^#[\da-f]{6}$/i.test(value) ? value : fallback;
}

function applyChatPreferences(root: HTMLElement) {
  root.style.setProperty('--chat-text-color', readColorPreference('skylineChatTextColor', CHAT_STYLE_DEFAULTS.text));
  root.style.setProperty('--chat-border-color', readColorPreference('skylineChatBorderColor', CHAT_STYLE_DEFAULTS.border));
  root.style.setProperty('--chat-own-message-color', readColorPreference('skylineChatOwnMessageColor', CHAT_STYLE_DEFAULTS.ownMessage));
  root.style.setProperty('--chat-other-message-color', readColorPreference('skylineChatOtherMessageColor', CHAT_STYLE_DEFAULTS.otherMessage));

  const wallpaper = localStorage.getItem('skylineChatWallpaper') || '';
  const safeWallpaper = wallpaper.length <= 2_200_000
    && /^data:image\/(?:png|jpeg|webp|gif);base64,[\da-z+/]+=*$/i.test(wallpaper)
    ? `url("${wallpaper}")`
    : 'none';
  const fit = localStorage.getItem('skylineChatWallpaperFit');
  const wallpaperFit: WallpaperFit = fit === 'contain' || fit === 'repeat' ? fit : 'cover';
  root.style.setProperty('--chat-wallpaper-image', safeWallpaper);
  root.style.setProperty('--chat-wallpaper-shade', safeWallpaper === 'none' ? 'transparent' : 'rgba(4, 8, 16, 0.38)');
  root.style.setProperty('--chat-wallpaper-size', wallpaperFit === 'repeat' ? '180px auto' : wallpaperFit);
  root.style.setProperty('--chat-wallpaper-repeat', wallpaperFit === 'repeat' ? 'repeat' : 'no-repeat');
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
  applyChatPreferences(root);
  root.style.colorScheme = root.dataset.theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = root.dataset.theme === 'light' ? '#f3f6fb' : '#090d16';
}
