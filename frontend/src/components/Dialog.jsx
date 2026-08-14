import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/utils.js';

// Radix supplies the keyboard, focus, and screen-reader behavior; this wrapper
// keeps the API used by the inventory forms compact.
export function Dialog({ open, title, wide = false, onClose, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#14152b]/30 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-black/10 bg-[#eef0ff] p-6 shadow-2xl outline-none',
            wide && 'max-w-2xl',
          )}
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <DialogPrimitive.Title className="text-xl font-medium tracking-[-.04em]">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-full p-2 text-[#66677a] transition-colors hover:bg-black/5 hover:text-[#14152b]"
              aria-label="Close dialog"
            >
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
