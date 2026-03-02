import { useState, useRef, useEffect } from "react";
import { FaChevronDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { formatCurrency } from "@/lib/formatCurrency";
import MonthBanner from "@/components/MonthBanner";

interface BudgetHeaderProps {
  month: number;
  year: number;
  remainingToBudget?: number;
  onMonthChange: (month: number, year: number) => void;
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

const monthsShort = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function BudgetHeader({
  month,
  year,
  remainingToBudget = 0,
  onMonthChange,
}: BudgetHeaderProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pickerOpen) setPickerYear(year);
  }, [pickerOpen, year]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [pickerOpen]);

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

  const handlePickMonth = (m: number) => {
    onMonthChange(m, pickerYear);
    setPickerOpen(false);
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
              <FaChevronDown size={14} className="inline-block ml-2 text-text-secondary group-hover:text-primary transition-colors align-middle" />
            </h1>
          </button>
          <p className="text-base font-semibold mt-1 text-text-secondary">
            {isBalanced
              ? "Budget is balanced"
              : `$${formatCurrency(Math.abs(remainingToBudget))} ${remainingToBudget > 0 ? "left to budget" : "over budget"}`}
          </p>

          {pickerOpen && (
            <div className="absolute top-full left-0 mt-2 bg-surface border border-border rounded-xl shadow-lg z-50 w-[280px] p-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setPickerYear(pickerYear - 1)}
                  className="p-1 text-text-secondary hover:text-primary transition-colors"
                >
                  <FaChevronLeft size={14} />
                </button>
                <span className="text-lg font-bold text-text-primary">{pickerYear}</span>
                <button
                  onClick={() => setPickerYear(pickerYear + 1)}
                  className="p-1 text-text-secondary hover:text-primary transition-colors"
                >
                  <FaChevronRight size={14} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {monthsShort.map((label, i) => {
                  const isSelected = i === month && pickerYear === year;
                  const isCurrent = i === currentMonth && pickerYear === currentYear;
                  return (
                    <button
                      key={i}
                      onClick={() => handlePickMonth(i)}
                      className={`py-2 px-1 rounded-lg text-sm font-medium transition-colors ${
                        isSelected
                          ? "bg-primary text-white"
                          : isCurrent
                            ? "bg-primary-light text-primary font-semibold"
                            : "text-text-primary hover:bg-surface-secondary"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-primary-border rounded-lg overflow-hidden">
            <button
              onClick={handlePrevMonth}
              className="px-3 py-2 text-primary hover:bg-primary-light transition-colors"
            >
              <FaChevronLeft size={20} />
            </button>
            <div className="w-px h-6 bg-primary-border" />
            <button
              onClick={handleNextMonth}
              className="px-3 py-2 text-primary hover:bg-primary-light transition-colors"
            >
              <FaChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
