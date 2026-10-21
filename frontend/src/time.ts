export const SYSTEM_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function getStoredTimeZone() {
  try {
    return localStorage.getItem('skylineTimeZone') || 'system';
  } catch {
    return 'system';
  }
}

export function getAppTimeZone() {
  const stored = getStoredTimeZone();
  if (stored === 'system') return Intl.DateTimeFormat().resolvedOptions().timeZone || SYSTEM_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('ru-RU', { timeZone: stored });
    return stored;
  } catch {
    return SYSTEM_TIME_ZONE;
  }
}

export function formatAppTime(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
    timeZone: getAppTimeZone(),
  }).format(new Date(value));
}

export function formatAppDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
    timeZone: getAppTimeZone(),
  }).format(new Date(value));
}

export function formatAppDateTime(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
    timeZone: getAppTimeZone(),
  }).format(new Date(value));
}

export function formatTimeZoneOffset(date = new Date(), timeZone = getAppTimeZone()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(date);
  return parts.find((part) => part.type === 'timeZoneName')?.value || 'UTC';
}
