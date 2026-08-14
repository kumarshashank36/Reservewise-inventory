import { cn } from '../../lib/utils.js';

export function Card({ className, ...props }) {
  return (
    <section
      className={cn(
        'app-card rounded-3xl border border-black/10 bg-white/65 shadow-[0_16px_44px_rgba(30,64,255,0.06)] backdrop-blur-sm',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('p-5 pb-0', className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn('p-5', className)} {...props} />;
}
