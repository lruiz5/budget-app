'use client';

import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/cn';

interface CurrencyInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Classes for the relative wrapper (e.g. flex-1 when composing in a row) */
  wrapperClassName?: string;
}

/** $-prefixed decimal input with native spinners hidden; selects all on focus. */
const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { className, wrapperClassName, onFocus, ...props },
  ref
) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none">$</span>
      <input
        ref={ref}
        type="number"
        step="0.01"
        onFocus={(e) => {
          e.target.select();
          onFocus?.(e);
        }}
        className={cn(
          'w-full pl-7 pr-3 py-2 border border-border-strong rounded-lg bg-surface text-text-primary placeholder:text-text-tertiary',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary',
          '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
          className
        )}
        {...props}
      />
    </div>
  );
});

export default CurrencyInput;
