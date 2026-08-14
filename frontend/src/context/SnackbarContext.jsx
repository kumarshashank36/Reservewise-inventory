import { createContext, useCallback, useContext, useState } from 'react';

const SnackbarContext = createContext(null);
let nextId = 1;

// Global toast stack: success/error feedback for transient outcomes (holds,
// releases, conflicts). Toasts auto-dismiss after a few seconds and can be
// dismissed manually.
export function SnackbarProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => { setToasts((current) => current.filter((toast) => toast.id !== id)); }, []);
  const showSnackbar = useCallback(({ kind = 'success', text, timeout = 5000 }) => {
    const id = nextId++;
    setToasts((current) => [...current, { id, kind, text }]);
    if (timeout > 0) setTimeout(() => dismiss(id), timeout);
  }, [dismiss]);
  return <SnackbarContext.Provider value={{ showSnackbar }}>
    {children}
    <div className="snackbar-stack" aria-live="polite">
      {toasts.map((toast) => <div key={toast.id} className={`snackbar ${toast.kind}`} role="status"><span>{toast.text}</span><button aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>×</button></div>)}
    </div>
  </SnackbarContext.Provider>;
}

export function useSnackbar() {
  const value = useContext(SnackbarContext);
  if (!value) throw new Error('useSnackbar must be used within SnackbarProvider');
  return value;
}
