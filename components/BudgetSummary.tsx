import { Budget } from "@/types/budget";

interface BudgetSummaryProps {
  budget: Budget;
}

export default function BudgetSummary({ budget }: BudgetSummaryProps) {
  const buffer = budget.buffer || 0;

  const totalIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.planned,
    0
  );

  const totalExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== "income")
    .reduce((sum, [, category]) => {
      return (
        sum + category.items.reduce((catSum, item) => catSum + item.planned, 0)
      );
    }, 0);

  const totalAvailable = buffer + totalIncome;
  const remainingToBudget = totalAvailable - totalExpenses;
  const isBalanced = Math.abs(remainingToBudget) < 0.01;

  const totalActualIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.actual,
    0
  );

  const totalActualExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== "income")
    .reduce((sum, [, category]) => {
      return (
        sum + category.items.reduce((catSum, item) => catSum + item.actual, 0)
      );
    }, 0);

  const totalActualAvailable = buffer + totalActualIncome;
  const actualRemaining = totalActualAvailable - totalActualExpenses;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 h-full">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Budget Summary</h2>

      <div className="space-y-8">
        {/* Planned Section */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Planned</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Buffer:</span>
              <span className="text-lg font-semibold text-purple-600">
                ${buffer.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Total Income:</span>
              <span className="text-lg font-semibold text-green-600">
                ${totalIncome.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Total Expenses:</span>
              <span className="text-lg font-semibold text-red-600">
                ${totalExpenses.toFixed(2)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 mt-3">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-900 text-sm">
                    Remaining:
                  </span>
                  <span
                    className={`text-2xl font-bold ${
                      isBalanced
                        ? "text-green-600"
                        : remainingToBudget > 0
                        ? "text-yellow-600"
                        : "text-red-600"
                    }`}
                  >
                    ${remainingToBudget.toFixed(2)}
                  </span>
                </div>
                {isBalanced && (
                  <p className="text-green-600 text-xs text-center">
                    ✓ Budget is balanced!
                  </p>
                )}
                {!isBalanced && remainingToBudget > 0 && (
                  <p className="text-yellow-600 text-xs text-center">
                    Unbudgeted income
                  </p>
                )}
                {!isBalanced && remainingToBudget < 0 && (
                  <p className="text-red-600 text-xs text-center">
                    Over budget!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actual Section */}
        <div>
          <h3 className="text-lg font-semibold text-gray-700 mb-4">Actual</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Buffer:</span>
              <span className="text-lg font-semibold text-purple-600">
                ${buffer.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Total Income:</span>
              <span className="text-lg font-semibold text-green-600">
                ${totalActualIncome.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-600 text-sm">Total Expenses:</span>
              <span className="text-lg font-semibold text-red-600">
                ${totalActualExpenses.toFixed(2)}
              </span>
            </div>
            <div className="border-t-2 border-gray-300 pt-3 mt-3">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-gray-900 text-sm">
                  Remaining:
                </span>
                <span
                  className={`text-2xl font-bold ${
                    actualRemaining >= 0 ? "text-green-600" : "text-red-600"
                  }`}
                >
                  ${actualRemaining.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
