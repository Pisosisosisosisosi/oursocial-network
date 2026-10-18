export function applyAppPreferences() {
  const root = document.documentElement;
  root.dataset.theme = localStorage.getItem('pulseTheme') === 'light' ? 'light' : 'dark';
  root.dataset.compact = localStorage.getItem('pulseCompactMode') === 'true' ? 'true' : 'false';
  root.dataset.reduceMotion = localStorage.getItem('pulseReduceMotion') === 'true' ? 'true' : 'false';
  const messageSize = localStorage.getItem('pulseMessageSize');
  root.dataset.messageSize = messageSize === 'small' || messageSize === 'large' ? messageSize : 'medium';
  root.style.colorScheme = root.dataset.theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = root.dataset.theme === 'light' ? '#f3f6fb' : '#090d16';
}
