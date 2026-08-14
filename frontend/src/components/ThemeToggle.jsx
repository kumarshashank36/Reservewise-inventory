import { useState } from 'react';
import { applyTheme, getTheme } from '../theme.js';

// Self-contained light/dark switch: reads the current theme off the document
// element, applies it there (so the whole CSS variable set flips), and persists
// the choice. Multiple instances across pages stay in sync via the DOM attribute.
export function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    setTheme(next);
  };
  return <button type="button" className="theme-toggle" data-tooltip={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>{theme === 'dark' ? '☀' : '☾'}</button>;
}
