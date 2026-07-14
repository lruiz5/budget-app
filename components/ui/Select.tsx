'use client';

import { SelectHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(
        'w-full px-3 py-2 border border-border-strong rounded-lg bg-surface text-text-primary',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
        className
      )}
      {...props}
    />
  );
});

export default Select;
