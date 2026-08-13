import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App.jsx';

describe('landing page', () => {
  it('introduces the inventory reservation product', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Every unit accounted for.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start reserving' })).toHaveAttribute('href', '/register');
  });
});
