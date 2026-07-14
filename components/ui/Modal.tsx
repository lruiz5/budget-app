'use client';

import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-4xl',
};

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  /** Replaces the default title/close-button header entirely */
  header?: ReactNode;
  /** Pinned below the scrollable content, on a secondary surface */
  footer?: ReactNode;
  /** Overrides the default content padding */
  contentClassName?: string;
  children: ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  header,
  footer,
  contentClassName,
  children,
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasHeader = header !== undefined || title !== undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        // Only close when the press starts on the backdrop itself, so drags
        // that end outside the panel (e.g. text selection) don't dismiss it
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'bg-surface rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden',
          sizeClasses[size]
        )}
      >
        {header ??
          (title !== undefined && (
            <div className="flex items-center justify-between gap-4 px-6 pt-6 pb-4">
              <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 -m-1 text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        <div className={cn('flex-1 overflow-y-auto', contentClassName ?? (hasHeader ? 'px-6 pb-6' : 'p-6'))}>
          {children}
        </div>
        {footer && <div className="border-t border-border px-6 py-4 bg-surface-secondary">{footer}</div>}
      </div>
    </div>
  );
}
