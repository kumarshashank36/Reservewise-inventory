import { createContext, useCallback, useContext, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';

const SnackbarContext = createContext(null);
let nextId = 1;

// Global toast stack: success/error feedback for transient outcomes (holds,
// releases, conflicts). Toasts auto-dismiss after a few seconds and can be
// dismissed manually.
export function SnackbarProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const showSnackbar = useCallback(
    ({ kind = 'success', text, timeout = 5000 }) => {
      const id = nextId++;
      setToasts((current) => [...current, { id, kind, text }]);
      if (timeout > 0) setTimeout(() => dismiss(id), timeout);
    },
    [dismiss],
  );
  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <div className="fixed right-5 bottom-5 z-[60] grid w-[min(92vw,24rem)] gap-2" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start justify-between gap-3 rounded-2xl border p-4 text-sm shadow-lg ${toast.kind === 'error' ? 'border-[#bd3954]/20 bg-[#fff1f3] text-[#a72f49]' : 'border-[#1e9b75]/20 bg-[#edfff9] text-[#107457]'}`}
            role="status"
          >
            <span>{toast.text}</span>
            <Button
              aria-label="Dismiss notification"
              className="-mt-2 -mr-2 shrink-0"
              size="icon"
              variant="ghost"
              onClick={() => dismiss(toast.id)}
            >
              <X size={16} />
            </Button>
          </div>
        ))}
      </div>
    </SnackbarContext.Provider>
  );
}

export function useSnackbar() {
  const value = useContext(SnackbarContext);
  if (!value) throw new Error('useSnackbar must be used within SnackbarProvider');
  return value;
}
