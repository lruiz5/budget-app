'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface MonthYearPickerProps {
  /** Currently selected month (0-indexed) */
  month: number;
  year: number;
  onSelect: (month: number, year: number) => void;
  /** Positioning classes for the popover panel */
  className?: string;
}

/**
 * Month/year grid popover panel. The parent owns open/close state and
 * outside-click handling; render this conditionally next to the trigger.
 */
export default function MonthYearPicker({ month, year, onSelect, className }: MonthYearPickerProps) {
  const [pickerYear, setPickerYear] = useState(year);
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  return (
    <div className={cn('bg-surface border border-border rounded-xl shadow-lg w-[280px] p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setPickerYear(pickerYear - 1)}
          aria-label="Previous year"
          className="p-1 text-text-secondary hover:text-primary transition-colors"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-lg font-bold text-text-primary">{pickerYear}</span>
        <button
          onClick={() => setPickerYear(pickerYear + 1)}
          aria-label="Next year"
          className="p-1 text-text-secondary hover:text-primary transition-colors"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {MONTHS_SHORT.map((label, i) => {
          const isSelected = i === month && pickerYear === year;
          const isCurrent = i === currentMonth && pickerYear === currentYear;
          return (
            <button
              key={i}
              onClick={() => onSelect(i, pickerYear)}
              className={`py-2 px-1 rounded-lg text-sm font-medium transition-colors ${
                isSelected
                  ? 'bg-primary text-white'
                  : isCurrent
                    ? 'bg-primary-light text-primary font-semibold'
                    : 'text-text-primary hover:bg-surface-secondary'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
