import { useEffect } from 'react';

// Centered confirmation dialog: dimmed backdrop, Escape or backdrop click
// cancels, and the confirm action is the prominent primary button.
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onCancel]);

  if (!open) return null;
  return <div className="dialog-overlay" onClick={onCancel}>
    <div className="dialog-panel" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <h2>{title}</h2>
      {message && <p>{message}</p>}
      <div className="dialog-actions">
        <button className="button button-secondary" autoFocus onClick={onCancel}>Cancel</button>
        <button className="button button-primary" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>;
}
