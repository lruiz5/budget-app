import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { formatCurrency } from "@/lib/formatCurrency";

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

export default function BudgetHeader({
  month,
  year,
  remainingToBudget = 0,
  onMonthChange,
}: BudgetHeaderProps) {
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

  const isBalanced = Math.abs(remainingToBudget) < 0.01;

  return (
    <div className="p-6 border-b border-border">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">
            <span>{months[month]}</span>{" "}
            <span className="text-text-secondary">{year}</span>
          </h1>
          <p className="text-base font-semibold mt-1 text-text-secondary">
            {isBalanced
              ? "Budget is balanced"
              : `$${formatCurrency(Math.abs(remainingToBudget))} ${remainingToBudget > 0 ? "left to budget" : "over budget"}`}
          </p>
        </div>
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
  );
}
