'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaChartLine, FaChartBar, FaChartPie, FaSync } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';
import MonthlyReportModal from '@/components/MonthlyReportModal';
import BudgetVsActualChart from '@/components/charts/BudgetVsActualChart';
import SpendingTrendsChart from '@/components/charts/SpendingTrendsChart';
import FlowDiagram from '@/components/charts/FlowDiagram';
import { Budget } from '@/types/budget';
import { transformDbBudgetToAppBudget } from '@/lib/budgetHelpers';

export default function InsightsPageWrapper() {
  return (
    <Suspense>
      <InsightsPage />
    </Suspense>
  );
}

function InsightsPage() {
  const searchParams = useSearchParams();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedMonth = searchParams.get('month') !== null ? parseInt(searchParams.get('month')!) : new Date().getMonth();
  const selectedYear = searchParams.get('year') !== null ? parseInt(searchParams.get('year')!) : new Date().getFullYear();

  const fetchMultiMonthBudgets = useCallback(async () => {
    setIsLoading(true);
    const budgetsData: Budget[] = [];

    // Fetch last 3 months of budgets (centered on selected month)
    for (let i = 0; i < 3; i++) {
      let month = selectedMonth - i;
      let year = selectedYear;

      // Handle year boundary
      if (month < 0) {
        month = 12 + month;
        year -= 1;
      }

      try {
        const response = await fetch(`/api/budgets?month=${month}&year=${year}`);
        const data = await response.json();
        const transformedBudget = transformDbBudgetToAppBudget(data);
        budgetsData.push(transformedBudget);
      } catch (error) {
        console.error(`Error fetching budget for ${month}/${year}:`, error);
      }
    }

    setBudgets(budgetsData.reverse()); // Oldest to newest
    setCurrentBudget(budgetsData[budgetsData.length - 1] || null);
    setIsLoading(false);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchMultiMonthBudgets();
  }, [fetchMultiMonthBudgets]);

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-surface-secondary p-4 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-text-primary">Insights</h1>
            <button
              onClick={fetchMultiMonthBudgets}
              className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
              title="Refresh data"
            >
              <FaSync className="text-sm" />
              <span className="text-sm font-medium">Refresh</span>
            </button>
          </div>

          {/* Monthly Summary Card */}
          <div className="bg-surface rounded-lg shadow p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary-light rounded-full flex items-center justify-center">
                <FaChartPie className="text-primary text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary">Monthly Summary</h2>
                <p className="text-text-secondary">Review your budget performance for the month</p>
              </div>
            </div>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="w-full py-3 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors font-medium"
            >
              View Monthly Report
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-text-secondary">Loading insights...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Budget vs Actual Chart */}
              <div className="bg-surface rounded-lg shadow p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-success-light rounded-full flex items-center justify-center">
                    <FaChartBar className="text-success text-xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">Budget vs Actual</h2>
                    <p className="text-text-secondary">Compare planned and actual spending by category</p>
                  </div>
                </div>
                <div className="h-[400px]">
                  <BudgetVsActualChart budget={currentBudget} />
                </div>
              </div>

              {/* Spending Trends Chart */}
              <div className="bg-surface rounded-lg shadow p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-info-light rounded-full flex items-center justify-center">
                    <FaChartLine className="text-info text-xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">Spending Trends</h2>
                    <p className="text-text-secondary">Track your spending over the last 3 months</p>
                  </div>
                </div>
                <div className="h-[400px]">
                  <SpendingTrendsChart budgets={budgets} />
                </div>
              </div>

              {/* Flow Diagram */}
              <div className="bg-surface rounded-lg shadow p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-accent-purple-light rounded-full flex items-center justify-center">
                    <FaChartPie className="text-accent-purple text-xl" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">Cash Flow</h2>
                    <p className="text-text-secondary">Visualize how income flows to expense categories</p>
                  </div>
                </div>
                <div className="h-[500px]">
                  <FlowDiagram budget={currentBudget} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Monthly Report Modal */}
      {currentBudget && (
        <MonthlyReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          budget={currentBudget}
        />
      )}
    </DashboardLayout>
  );
}
