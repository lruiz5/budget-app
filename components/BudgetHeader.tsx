import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Ellipsis } from "lucide-react";
import { formatCurrency } from "@/lib/formatCurrency";
import MonthBanner from "@/components/MonthBanner";
import MonthYearPicker from "@/components/MonthYearPicker";

interface BudgetHeaderProps {
  month: number;
  year: number;
  remainingToBudget?: number;
  onMonthChange: (month: number, year: number) => void;
  /** When provided, shows an overflow menu with a "Reset Budget…" action */
  onResetBudget?: () => void;
}

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export default function BudgetHeader({
  month,
  year,
  remainingToBudget = 0,
  onMonthChange,
  onResetBudget,
}: BudgetHeaderProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (pickerOpen || menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [pickerOpen, menuOpen]);

  const handlePrevMonth = () => {
    if (month === 0) {
      onMonthChange(11, year - 1);
    } else {
      onMonthChange(month - 1, year);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      onMonthChange(0, year + 1);
    } else {
      onMonthChange(month + 1, year);
    }
  };

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const isCurrentMonth = month === currentMonth && year === currentYear;
  const isBalanced = Math.abs(remainingToBudget) < 0.01;

  const isPast = year < currentYear || (year === currentYear && month < currentMonth);

  return (
    <div className="border-b border-border">
      {!isCurrentMonth && (
        <MonthBanner
          isPast={isPast}
          currentMonthName={months[currentMonth]}
          onGoToCurrent={() => onMonthChange(currentMonth, currentYear)}
        />
      )}
      <div className="p-6">
      <div className="flex items-center justify-between">
        <div className="relative" ref={pickerRef}>
          <button
            onClick={() => setPickerOpen(!pickerOpen)}
            className="text-left group cursor-pointer"
          >
            <h1 className="text-3xl font-bold text-text-primary">
              <span className="group-hover:text-primary transition-colors">{months[month]}</span>{" "}
              <span className="text-text-secondary group-hover:text-primary transition-colors">{year}</span>
              <ChevronDown size={14} className="inline-block ml-2 text-text-secondary group-hover:text-primary transition-colors align-middle" />
            </h1>
          </button>
          <p className="text-base font-semibold mt-1 text-text-secondary">
            {isBalanced
              ? "Budget is balanced"
              : `$${formatCurrency(Math.abs(remainingToBudget))} ${remainingToBudget > 0 ? "left to budget" : "over budget"}`}
          </p>

          {pickerOpen && (
            <MonthYearPicker
              month={month}
              year={year}
              onSelect={(m, y) => {
                onMonthChange(m, y);
                setPickerOpen(false);
              }}
              className="absolute top-full left-0 mt-2 z-50"
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-primary-border rounded-lg overflow-hidden">
            <button
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="px-3 py-2 text-primary hover:bg-primary-light transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="w-px h-6 bg-primary-border" />
            <button
              onClick={handleNextMonth}
              aria-label="Next month"
              className="px-3 py-2 text-primary hover:bg-primary-light transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {onResetBudget && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                aria-label="More actions"
                className="p-2.5 rounded-lg text-text-secondary hover:bg-surface-secondary hover:text-text-primary transition-colors"
              >
                <Ellipsis size={20} />
              </button>
              {menuOpen && (
                <div className="absolute top-full right-0 mt-2 z-50 bg-surface border border-border rounded-xl shadow-lg py-1.5 w-48">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onResetBudget();
                    }}
                    className="w-full text-left px-4 py-2 text-sm font-medium text-danger hover:bg-danger-light transition-colors"
                  >
                    Reset Budget…
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
