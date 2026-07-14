'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { ChartLine, ChartColumn, ChartPie, RefreshCw } from "lucide-react";
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Skeleton from '@/components/ui/Skeleton';
import MonthNavigator from '@/components/MonthNavigator';
import MonthBanner from '@/components/MonthBanner';
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

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function InsightsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [currentBudget, setCurrentBudget] = useState<Budget | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const selectedMonth = searchParams.get('month') !== null ? parseInt(searchParams.get('month')!) : currentMonth;
  const selectedYear = searchParams.get('year') !== null ? parseInt(searchParams.get('year')!) : currentYear;
  const isCurrentMonth = selectedMonth === currentMonth && selectedYear === currentYear;
  const isPast = selectedYear < currentYear || (selectedYear === currentYear && selectedMonth < currentMonth);

  const fetchMultiMonthBudgets = useCallback(async () => {
    setIsLoading(true);

    // Build list of months to fetch (current + 5 previous = 6 total)
    const monthsToFetch: { month: number; year: number }[] = [];
    for (let i = 0; i < 6; i++) {
      let month = selectedMonth - i;
      let year = selectedYear;

      // Handle year boundary
      if (month < 0) {
        month = 12 + month;
        year -= 1;
      }

      monthsToFetch.push({ month, year });
    }

    // Fetch all months in parallel
    const results = await Promise.all(
      monthsToFetch.map(async ({ month, year }) => {
        try {
          const response = await fetch(`/api/budgets?month=${month}&year=${year}`);
          const data = await response.json();
          return transformDbBudgetToAppBudget(data);
        } catch (error) {
          console.error(`Error fetching budget for ${month}/${year}:`, error);
          return null;
        }
      })
    );

    const budgetsData = results.filter((b): b is Budget => b !== null);
    budgetsData.reverse(); // Oldest to newest
    setBudgets(budgetsData);
    setCurrentBudget(budgetsData[budgetsData.length - 1] || null);
    setIsLoading(false);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    fetchMultiMonthBudgets();
  }, [fetchMultiMonthBudgets]);

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto bg-surface-secondary">
        {!isCurrentMonth && (
          <MonthBanner
            isPast={isPast}
            currentMonthName={monthNames[currentMonth]}
            onGoToCurrent={() => router.push(`/insights?month=${currentMonth}&year=${currentYear}`)}
          />
        )}
        <div className="max-w-6xl mx-auto p-4 lg:p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-text-primary">Insights</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchMultiMonthBudgets}
                aria-label="Refresh data"
                className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-surface rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw size={14} />
                <span className="text-sm font-medium">Refresh</span>
              </button>
              <MonthNavigator
                month={selectedMonth}
                year={selectedYear}
                onChange={(m, y) => router.push(`/insights?month=${m}&year=${y}`)}
              />
            </div>
          </div>

          {/* Monthly Summary Card */}
          <Card className="p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-primary-light rounded-full flex items-center justify-center">
                <ChartPie className="text-primary" size={20} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-text-primary">Monthly Summary</h2>
                <p className="text-text-secondary">Review your budget performance for the month</p>
              </div>
            </div>
            <Button size="lg" className="w-full" onClick={() => setIsReportModalOpen(true)}>
              View Monthly Report
            </Button>
          </Card>

          {isLoading ? (
            <div className="space-y-6">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="p-6">
                  <div className="flex items-center gap-4 mb-4">
                    <Skeleton className="w-12 h-12 rounded-full" />
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-44" />
                      <Skeleton className="h-4 w-72" />
                    </div>
                  </div>
                  <Skeleton className="h-[400px] w-full" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Budget vs Actual Chart */}
              <Card className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-success-light rounded-full flex items-center justify-center">
                    <ChartColumn className="text-success" size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">Budget vs Actual</h2>
                    <p className="text-text-secondary">Compare planned and actual spending by category</p>
                  </div>
                </div>
                <div className="h-[400px]">
                  <BudgetVsActualChart budget={currentBudget} />
                </div>
              </Card>

              {/* Spending Trends Chart */}
              <Card className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-info-light rounded-full flex items-center justify-center">
                    <ChartLine className="text-info" size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">Spending Trends</h2>
                    <p className="text-text-secondary">Track your spending over the last 6 months</p>
                  </div>
                </div>
                <div className="h-[400px]">
                  <SpendingTrendsChart budgets={budgets} />
                </div>
              </Card>

              {/* Flow Diagram */}
              <Card className="p-6">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 bg-accent-purple-light rounded-full flex items-center justify-center">
                    <ChartPie className="text-accent-purple" size={20} />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-text-primary">Cash Flow</h2>
                    <p className="text-text-secondary">Visualize how income flows to expense categories</p>
                  </div>
                </div>
                <div className="h-[500px]">
                  <FlowDiagram budget={currentBudget} />
                </div>
              </Card>
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
