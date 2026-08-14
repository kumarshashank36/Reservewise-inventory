import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getTheme } from '../theme.js';
import { Button } from './ui/button.jsx';

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
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <Button size="icon" variant="ghost" aria-label={label} data-tooltip={label} title={label} onClick={toggle}>
      {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
    </Button>
  );
}
