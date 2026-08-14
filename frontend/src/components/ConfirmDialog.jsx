import { Dialog } from './Dialog.jsx';
import { Button } from './ui/button.jsx';

// Centered confirmation dialog built on the shared modal shell: the confirm
// action is the prominent primary button, Cancel/Escape/backdrop dismiss.
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <Dialog open={open} title={title} onClose={onCancel}>
      {message && <p className="mb-6 text-sm leading-6 text-[#53536a]">{message}</p>}
      <div className="flex justify-end gap-2">
        <Button autoFocus variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
