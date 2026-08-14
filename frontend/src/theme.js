const STORAGE_KEY = 'reservewise.theme';

export function getTheme() {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark') return 'dark';
  return 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}
