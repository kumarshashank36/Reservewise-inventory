import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from './ThemeToggle.jsx';

beforeEach(() => {
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});
afterEach(cleanup);

describe('ThemeToggle', () => {
  it('starts in light mode and switches the document theme attribute', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button', { name: 'Switch to dark mode' });
    expect(button).toHaveAttribute('data-tooltip', 'Switch to dark mode');
    fireEvent.click(button);
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('reservewise.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toHaveAttribute(
      'data-tooltip',
      'Switch to light mode',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('reservewise.theme')).toBe('light');
  });

  it('reflects an already-applied dark theme on mount', () => {
    document.documentElement.dataset.theme = 'dark';
    render(<ThemeToggle />);
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeInTheDocument();
  });
});
