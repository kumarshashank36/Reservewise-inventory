import { useEffect } from 'react';

// Centered modal shell: dimmed backdrop, Escape or backdrop click closes,
// body scroll locks while open. Pass `wide` for form-sized dialogs.
export function Dialog({ open, title, wide = false, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return <div className="dialog-overlay" onClick={onClose}>
    <div className={`dialog-panel${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <div className="dialog-head"><h2>{title}</h2><button className="dialog-close" aria-label="Close dialog" onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}
