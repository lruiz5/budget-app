import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Standard surface: border + subtle shadow, xl radius. */
export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-surface rounded-xl border border-border shadow-sm', className)} {...props} />;
}
