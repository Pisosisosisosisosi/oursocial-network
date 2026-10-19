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
  root.style.colorScheme = root.dataset.theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = root.dataset.theme === 'light' ? '#f3f6fb' : '#090d16';
}
