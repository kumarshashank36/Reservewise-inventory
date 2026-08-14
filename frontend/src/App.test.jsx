import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import App from './App.jsx';

afterEach(cleanup);

describe('landing page', () => {
  it('introduces the inventory reservation product', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Every unit accounted for.' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start reserving' })).toHaveAttribute('href', '/register');
  });
});

describe('lazy-loaded routes', () => {
  it('loads the auth chunk and renders the sign-in page on /login', async () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Customer' })).toBeInTheDocument();
  });

  it('guards protected routes before their chunk loads: /admin redirects to sign-in', async () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <App />
      </MemoryRouter>,
    );
    // The redirect happens in the eager Protected guard; the lazy auth page then loads.
    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeInTheDocument();
  });
});
