import { Dialog } from './Dialog.jsx';

// Centered confirmation dialog built on the shared modal shell: the confirm
// action is the prominent primary button, Cancel/Escape/backdrop dismiss.
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return <Dialog open={open} title={title} onClose={onCancel}>
    {message && <p className="dialog-message">{message}</p>}
    <div className="dialog-actions">
      <button className="button button-secondary" autoFocus onClick={onCancel}>Cancel</button>
      <button className="button button-primary" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </Dialog>;
}
