'use client';

import { useEffect, useState } from 'react';
import { CircleCheck, CircleAlert, Info, CircleX, X } from "lucide-react";

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  onDismiss: (id: string) => void;
}

const toastConfig = {
  success: {
    icon: CircleCheck,
    borderColor: 'border-success',
    bgColor: 'bg-success-light',
    textColor: 'text-success',
    iconColor: 'text-success',
  },
  error: {
    icon: CircleX,
    borderColor: 'border-danger',
    bgColor: 'bg-danger-light',
    textColor: 'text-danger',
    iconColor: 'text-danger',
  },
  warning: {
    icon: CircleAlert,
    borderColor: 'border-warning',
    bgColor: 'bg-warning-light',
    textColor: 'text-warning',
    iconColor: 'text-warning',
  },
  info: {
    icon: Info,
    borderColor: 'border-info',
    bgColor: 'bg-info-light',
    textColor: 'text-info',
    iconColor: 'text-info',
  },
};

export default function Toast({ id, type, message, duration = 4000, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const config = toastConfig[type];
  const Icon = config.icon;

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => {
      setIsVisible(true);
    });

    // Auto dismiss
    const timer = setTimeout(() => {
      handleDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration]);

  const handleDismiss = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onDismiss(id);
    }, 300);
  };

  return (
    <div
      role="alert"
      className={`
        flex items-center p-4 mb-2 border-t-4 rounded-lg shadow-lg
        ${config.borderColor} ${config.bgColor} ${config.textColor}
        transform transition-all duration-300 ease-in-out
        ${isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'}
      `}
    >
      <Icon className={`flex-shrink-0 w-5 h-5 ${config.iconColor}`} />
      <div className="ml-3 text-sm font-medium">{message}</div>
      <button
        type="button"
        onClick={handleDismiss}
        className={`
          ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5
          ${config.bgColor} ${config.textColor}
          hover:bg-opacity-50 focus:ring-2 focus:ring-opacity-50
          inline-flex items-center justify-center h-8 w-8
        `}
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}
