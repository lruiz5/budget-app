'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(
        'w-full px-3 py-2 border border-border-strong rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
        className
      )}
      {...props}
    />
  );
});

export default Input;
