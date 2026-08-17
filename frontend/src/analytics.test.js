import { afterEach, describe, expect, it, vi } from 'vitest';

// The measurement ID is read at module scope, so each case reloads the module
// with the environment stubbed (or not) beforehand.
async function loadAnalyticsModule() {
  vi.resetModules();
  return import('./analytics.js');
}

function configCalls() {
  return window.dataLayer.filter((entry) => entry[0] === 'config');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete window.gtag;
  delete window.dataLayer;
});

describe('trackPageView', () => {
  it('is a complete no-op when no measurement ID is configured', async () => {
    const { trackPageView } = await loadAnalyticsModule();
    trackPageView('/app');

    expect(window.gtag).toBeUndefined();
    expect(document.querySelector('script[src*="googletagmanager"]')).toBeNull();
  });

  it('loads the gtag snippet and emits a config call with the page path', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    const { trackPageView } = await loadAnalyticsModule();

    trackPageView('/app/wishlist');

    const calls = configCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe('G-TEST123');
    expect(calls[0][2]).toMatchObject({ page_path: '/app/wishlist' });
    expect(
      document.querySelector('script[src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"]'),
    ).not.toBeNull();
  });

  it('does not double-emit for the same path (StrictMode dev double-mount)', async () => {
    vi.stubEnv('VITE_GA_MEASUREMENT_ID', 'G-TEST123');
    const { trackPageView } = await loadAnalyticsModule();

    trackPageView('/app');
    trackPageView('/app');
    trackPageView('/admin');
    trackPageView('/admin');

    expect(configCalls().map((entry) => entry[2].page_path)).toEqual(['/app', '/admin']);
  });
});
