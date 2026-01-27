'use client';

import { useState, useEffect } from 'react';
import { Budget, BudgetItem } from '@/types/budget';
import { FaTimes, FaArrowUp, FaArrowDown, FaMinus } from 'react-icons/fa';

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: Budget;
}

interface CategorySummary {
  name: string;
  emoji: string;
  planned: number;
  actual: number;
  difference: number;
  percentUsed: number;
}

interface TopSpendingItem {
  name: string;
  category: string;
  planned: number;
  actual: number;
  percentOfTotal: number;
}

interface PreviousMonthData {
  totalExpenses: number;
  totalIncome: number;
  categoryTotals: Record<string, number>;
}

const categoryEmojis: Record<string, string> = {
  'Income': '💰',
  'Giving': '🤲',
  'Household': '🏠',
  'Transportation': '🚗',
  'Food': '🍽️',
  'Personal': '👤',
  'Insurance': '🛡️',
  'Saving': '💵',
};

export default function MonthlyReportModal({ isOpen, onClose, budget }: MonthlyReportModalProps) {
  const [previousMonth, setPreviousMonth] = useState<PreviousMonthData | null>(null);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);

  // Fetch previous month data for comparison
  useEffect(() => {
    if (isOpen) {
      fetchPreviousMonth();
    }
  }, [isOpen, budget.month, budget.year]);

  const fetchPreviousMonth = async () => {
    setIsLoadingPrevious(true);
    try {
      // Calculate previous month
      let prevMonth = budget.month - 1;
      let prevYear = budget.year;
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }

      const response = await fetch(`/api/budgets?month=${prevMonth}&year=${prevYear}`);
      if (response.ok) {
        const data = await response.json();
        if (data && data.categories) {
          // Transform the data
          const { transformDbBudgetToAppBudget } = await import('@/lib/budgetHelpers');
          const prevBudget = transformDbBudgetToAppBudget(data);

          const categoryTotals: Record<string, number> = {};
          let totalExpenses = 0;
          let totalIncome = 0;

          Object.entries(prevBudget.categories).forEach(([key, category]) => {
            const catActual = category.items.reduce((sum, item) => sum + item.actual, 0);
            categoryTotals[key] = catActual;

            if (key === 'income') {
              totalIncome = catActual;
            } else {
              totalExpenses += catActual;
            }
          });

          setPreviousMonth({
            totalExpenses,
            totalIncome,
            categoryTotals,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching previous month:', error);
    } finally {
      setIsLoadingPrevious(false);
    }
  };

  if (!isOpen) return null;

  // Calculate current month totals
  const totalIncome = budget.categories.income.items.reduce((sum, item) => sum + item.actual, 0);
  const totalPlannedIncome = budget.categories.income.items.reduce((sum, item) => sum + item.planned, 0);

  const expenseCategories = Object.entries(budget.categories).filter(([key]) => key !== 'income');
  const totalExpenses = expenseCategories.reduce((sum, [, category]) => {
    return sum + category.items.reduce((catSum, item) => catSum + item.actual, 0);
  }, 0);
  const totalPlannedExpenses = expenseCategories.reduce((sum, [, category]) => {
    return sum + category.items.reduce((catSum, item) => catSum + item.planned, 0);
  }, 0);

  const buffer = budget.buffer || 0;
  const totalAvailable = buffer + totalIncome;
  const netSavings = totalAvailable - totalExpenses;
  const savingsRate = totalAvailable > 0 ? ((netSavings / totalAvailable) * 100) : 0;

  // Calculate underspent and overspent for expense categories
  let totalUnderspent = 0;
  let totalOverspent = 0;
  expenseCategories.forEach(([, category]) => {
    category.items.forEach((item) => {
      const diff = item.planned - item.actual;
      if (diff > 0) {
        totalUnderspent += diff;
      } else if (diff < 0) {
        totalOverspent += Math.abs(diff);
      }
    });
  });

  // Income variance (actual income vs planned income)
  const incomeVariance = totalIncome - totalPlannedIncome;

  // Theoretical next month buffer = current buffer + underspent - overspent + income variance
  const theoreticalNextBuffer = buffer + totalUnderspent - totalOverspent + incomeVariance;

  // Category summaries
  const categorySummaries: CategorySummary[] = Object.entries(budget.categories)
    .filter(([key]) => key !== 'income')
    .map(([key, category]) => {
      const planned = category.items.reduce((sum, item) => sum + item.planned, 0);
      const actual = category.items.reduce((sum, item) => sum + item.actual, 0);
      const difference = planned - actual;
      const percentUsed = planned > 0 ? (actual / planned) * 100 : 0;

      return {
        name: category.name,
        emoji: categoryEmojis[category.name] || '📋',
        planned,
        actual,
        difference,
        percentUsed,
      };
    })
    .sort((a, b) => b.actual - a.actual);

  // Top spending items (top 10)
  const allItems: TopSpendingItem[] = [];
  expenseCategories.forEach(([, category]) => {
    category.items.forEach((item) => {
      if (item.actual > 0) {
        allItems.push({
          name: item.name,
          category: category.name,
          planned: item.planned,
          actual: item.actual,
          percentOfTotal: totalExpenses > 0 ? (item.actual / totalExpenses) * 100 : 0,
        });
      }
    });
  });
  const topSpending = allItems.sort((a, b) => b.actual - a.actual).slice(0, 10);

  // Unused/underspent categories (less than 50% used)
  const underspentCategories = categorySummaries.filter(
    (cat) => cat.planned > 0 && cat.percentUsed < 50
  );

  // Month name
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[budget.month];

  // Trend calculations
  const expenseTrend = previousMonth
    ? ((totalExpenses - previousMonth.totalExpenses) / previousMonth.totalExpenses) * 100
    : null;
  const incomeTrend = previousMonth
    ? ((totalIncome - previousMonth.totalIncome) / previousMonth.totalIncome) * 100
    : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Monthly Budget Report</h2>
            <p className="text-blue-100">{monthName} {budget.year}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <FaTimes size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Overall Summary */}
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Overall Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-sm text-green-600 mb-1">Total Income</div>
                <div className="text-2xl font-bold text-green-700">${totalIncome.toFixed(2)}</div>
                {incomeTrend !== null && (
                  <div className={`text-xs flex items-center gap-1 mt-1 ${incomeTrend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {incomeTrend >= 0 ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                    {Math.abs(incomeTrend).toFixed(1)}% vs last month
                  </div>
                )}
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-sm text-red-600 mb-1">Total Expenses</div>
                <div className="text-2xl font-bold text-red-700">${totalExpenses.toFixed(2)}</div>
                {expenseTrend !== null && (
                  <div className={`text-xs flex items-center gap-1 mt-1 ${expenseTrend <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {expenseTrend >= 0 ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                    {Math.abs(expenseTrend).toFixed(1)}% vs last month
                  </div>
                )}
              </div>
              <div className={`${netSavings >= 0 ? 'bg-blue-50' : 'bg-orange-50'} rounded-lg p-4`}>
                <div className={`text-sm ${netSavings >= 0 ? 'text-blue-600' : 'text-orange-600'} mb-1`}>Net Savings</div>
                <div className={`text-2xl font-bold ${netSavings >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                  ${netSavings.toFixed(2)}
                </div>
              </div>
              <div className={`${savingsRate >= 10 ? 'bg-purple-50' : 'bg-gray-50'} rounded-lg p-4`}>
                <div className={`text-sm ${savingsRate >= 10 ? 'text-purple-600' : 'text-gray-600'} mb-1`}>Savings Rate</div>
                <div className={`text-2xl font-bold ${savingsRate >= 10 ? 'text-purple-700' : 'text-gray-700'}`}>
                  {savingsRate.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Budget vs Actual Summary */}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Planned Income</span>
                  <span className="font-semibold">${totalPlannedIncome.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Actual Income</span>
                  <span className={`font-semibold ${totalIncome >= totalPlannedIncome ? 'text-green-600' : 'text-red-600'}`}>
                    ${totalIncome.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Planned Expenses</span>
                  <span className="font-semibold">${totalPlannedExpenses.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Actual Expenses</span>
                  <span className={`font-semibold ${totalExpenses <= totalPlannedExpenses ? 'text-green-600' : 'text-red-600'}`}>
                    ${totalExpenses.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Buffer Flow */}
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Buffer Flow</h3>
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-5 border border-slate-200">
              <div className="space-y-3">
                {/* Current Buffer */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Current Buffer</span>
                  <span className="font-semibold text-gray-900">${buffer.toFixed(2)}</span>
                </div>

                {/* Underspent */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">+ Underspent</span>
                  <span className="font-semibold text-green-600">+${totalUnderspent.toFixed(2)}</span>
                </div>

                {/* Overspent */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">- Overspent</span>
                  <span className="font-semibold text-red-600">-${totalOverspent.toFixed(2)}</span>
                </div>

                {/* Divider */}
                <div className="border-t border-slate-300 my-2"></div>

                {/* Projected Next Buffer */}
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-gray-800">Projected Next Month Buffer</span>
                  <span className={`text-xl font-bold ${theoreticalNextBuffer >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    ${theoreticalNextBuffer.toFixed(2)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-gray-500 mt-4">
                This shows how your buffer would change based on this month&apos;s spending and income patterns.
              </p>
            </div>
          </section>

          {/* Category Breakdown */}
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Category Breakdown</h3>
            <div className="space-y-3">
              {categorySummaries.map((cat) => (
                <div key={cat.name} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{cat.emoji}</span>
                      <span className="font-medium text-gray-900">{cat.name}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Planned</div>
                        <div className="font-semibold">${cat.planned.toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">Actual</div>
                        <div className="font-semibold">${cat.actual.toFixed(2)}</div>
                      </div>
                      <div className={`text-right min-w-[80px] ${cat.difference >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        <div className="text-sm">{cat.difference >= 0 ? 'Under' : 'Over'}</div>
                        <div className="font-semibold">${Math.abs(cat.difference).toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        cat.percentUsed > 100 ? 'bg-red-500' : cat.percentUsed > 90 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(cat.percentUsed, 100)}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-500 mt-1 text-right">
                    {cat.percentUsed.toFixed(0)}% used
                  </div>

                  {/* Trend comparison */}
                  {previousMonth && previousMonth.categoryTotals[cat.name.toLowerCase()] !== undefined && (
                    <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                      {(() => {
                        const prevAmount = previousMonth.categoryTotals[cat.name.toLowerCase()] || 0;
                        const trend = prevAmount > 0 ? ((cat.actual - prevAmount) / prevAmount) * 100 : 0;
                        if (Math.abs(trend) < 1) {
                          return <><FaMinus size={10} className="text-gray-400" /> About the same as last month</>;
                        }
                        return trend > 0
                          ? <><FaArrowUp size={10} className="text-red-500" /> {trend.toFixed(0)}% more than last month</>
                          : <><FaArrowDown size={10} className="text-green-500" /> {Math.abs(trend).toFixed(0)}% less than last month</>;
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Top Spending Items */}
          <section>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Top Spending Items</h3>
            <div className="bg-gray-50 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">#</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">Item</th>
                    <th className="text-left px-4 py-2 text-sm font-medium text-gray-600">Category</th>
                    <th className="text-right px-4 py-2 text-sm font-medium text-gray-600">Planned</th>
                    <th className="text-right px-4 py-2 text-sm font-medium text-gray-600">Actual</th>
                    <th className="text-right px-4 py-2 text-sm font-medium text-gray-600">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {topSpending.map((item, index) => (
                    <tr key={`${item.category}-${item.name}`} className="border-t border-gray-200">
                      <td className="px-4 py-2 text-sm text-gray-500">{index + 1}</td>
                      <td className="px-4 py-2 text-sm font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-500">{item.category}</td>
                      <td className="px-4 py-2 text-sm text-right text-gray-600">${item.planned.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-sm text-right font-medium ${item.actual > item.planned ? 'text-red-600' : 'text-gray-900'}`}>
                        ${item.actual.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-500">{item.percentOfTotal.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Underspent Categories */}
          {underspentCategories.length > 0 && (
            <section>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Potential Reallocation</h3>
              <p className="text-sm text-gray-600 mb-3">
                These categories were under 50% utilized. Consider adjusting next month&apos;s budget.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {underspentCategories.map((cat) => (
                  <div key={cat.name} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span>{cat.emoji}</span>
                      <span className="font-medium text-gray-900">{cat.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      ${cat.actual.toFixed(2)} of ${cat.planned.toFixed(2)} used
                    </div>
                    <div className="text-sm text-yellow-700 font-medium">
                      ${cat.difference.toFixed(2)} unused
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Loading indicator for trends */}
          {isLoadingPrevious && (
            <div className="text-center text-gray-500 text-sm">
              Loading previous month data for comparison...
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}