import { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Pulsing placeholder block; size it with width/height classes. */
export default function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-border/70', className)} {...props} />;
}
