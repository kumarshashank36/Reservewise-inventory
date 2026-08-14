import '@testing-library/jest-dom/vitest';

// Vitest's jsdom environment does not provide localStorage without a file-backed
// store, but the app uses it for session persistence. Provide an in-memory stand-in.
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  },
});
