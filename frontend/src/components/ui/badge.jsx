import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils.js';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold', {
  variants: {
    variant: {
      default: 'bg-[#1e40ff]/10 text-[#1e40ff]',
      success: 'bg-[#1e9b75]/12 text-[#107457]',
      warning: 'bg-[#e9a538]/15 text-[#8b5a00]',
      muted: 'bg-black/5 text-[#626275]',
      danger: 'bg-[#bd3954]/10 text-[#a72f49]',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
