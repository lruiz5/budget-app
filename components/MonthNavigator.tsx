'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import MonthYearPicker from './MonthYearPicker';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface MonthNavigatorProps {
  month: number;
  year: number;
  onChange: (month: number, year: number) => void;
}

/** Compact month control: prev/next chevrons around a label that opens the month/year picker. */
export default function MonthNavigator({ month, year, onChange }: MonthNavigatorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [pickerOpen]);

  const handlePrev = () => (month === 0 ? onChange(11, year - 1) : onChange(month - 1, year));
  const handleNext = () => (month === 11 ? onChange(0, year + 1) : onChange(month + 1, year));

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <button
        onClick={handlePrev}
        aria-label="Previous month"
        className="p-2 rounded-lg hover:bg-black/5 transition-colors text-text-secondary"
      >
        <ChevronLeft size={14} />
      </button>
      <button
        onClick={() => setPickerOpen(!pickerOpen)}
        className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-lg min-w-[160px] text-lg font-semibold text-text-primary hover:bg-black/5 transition-colors"
      >
        {MONTH_NAMES[month]} {year}
        <ChevronDown size={12} className="text-text-secondary" />
      </button>
      <button
        onClick={handleNext}
        aria-label="Next month"
        className="p-2 rounded-lg hover:bg-black/5 transition-colors text-text-secondary"
      >
        <ChevronRight size={14} />
      </button>
      {pickerOpen && (
        <MonthYearPicker
          month={month}
          year={year}
          onSelect={(m, y) => {
            onChange(m, y);
            setPickerOpen(false);
          }}
          className="absolute top-full right-0 mt-2 z-50"
        />
      )}
    </div>
  );
}
