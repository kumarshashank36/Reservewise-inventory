import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

export const buttonVariants = cva(
  'inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e40ff] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[#1e40ff] text-white hover:bg-[#1635e3]',
        secondary: 'border border-black/10 bg-white/65 text-[#14152b] hover:bg-white',
        outline: 'border border-black/10 bg-transparent text-[#14152b] hover:bg-white/55',
        ghost: 'text-[#53536a] hover:bg-black/5 hover:text-[#14152b]',
        destructive: 'bg-[#bd3954] text-white hover:bg-[#a72f49]',
      },
      size: { default: 'h-10 px-4', sm: 'h-8 px-3 text-xs', lg: 'h-11 px-5', icon: 'h-10 w-10 p-0' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({ className, variant, size, type = 'button', ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} type={type} {...props} />;
}
