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
    <div className="p-6 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {months[month]} {year}
          </h1>
          <p className="text-sm mt-1 text-gray-600">
            {isBalanced
              ? 'Budget is balanced'
              : `$${Math.abs(remainingToBudget).toFixed(2)} ${remainingToBudget > 0 ? 'left to budget' : 'over budget'}`
            }
          </p>
        </div>
        <div className="flex items-center">
          <button
            onClick={handlePrevMonth}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-l-md border border-gray-200 transition-colors"
          >
            &lt;
          </button>
          <button
            onClick={handleNextMonth}
            className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-r-md border border-l-0 border-gray-200 transition-colors"
          >
            &gt;
          </button>
        </div>
      </div>
    </div>
  );
}
