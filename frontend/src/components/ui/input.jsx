import { cn } from '../../lib/utils.js';

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'app-input flex h-10 w-full rounded-xl border border-black/10 bg-white/70 px-3 text-sm text-[#14152b] outline-none placeholder:text-[#77788b] focus:border-[#1e40ff] focus:ring-4 focus:ring-[#1e40ff]/10 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
