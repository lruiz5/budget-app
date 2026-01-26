'use client';

import { useState, useEffect, useCallback } from 'react';
import { FaChartLine, FaChartBar, FaChartPie } from 'react-icons/fa';
import DashboardLayout from '@/components/DashboardLayout';
import MonthlyReportModal from '@/components/MonthlyReportModal';
import { Budget } from '@/types/budget';
import { transformDbBudgetToAppBudget } from '@/lib/budgetHelpers';

export default function InsightsPage() {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [budget, setBudget] = useState<Budget | null>(null);

  const fetchCurrentBudget = useCallback(async () => {
    const currentDate = new Date();
    const month = currentDate.getMonth();
    const year = currentDate.getFullYear();

    try {
      const response = await fetch(`/api/budgets?month=${month}&year=${year}`);
      const data = await response.json();
      const transformedBudget = transformDbBudgetToAppBudget(data);
      setBudget(transformedBudget);
    } catch (error) {
      console.error('Error fetching budget:', error);
    }
  }, []);

  useEffect(() => {
    fetchCurrentBudget();
  }, [fetchCurrentBudget]);

  return (
    <DashboardLayout onOpenMonthlyReport={() => setIsReportModalOpen(true)}>
      <div className="h-full overflow-y-auto bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Insights</h1>

          {/* Monthly Summary Card */}
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <FaChartPie className="text-blue-600 text-xl" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Monthly Summary</h2>
                <p className="text-gray-600">Review your budget performance for the month</p>
              </div>
            </div>
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              View Monthly Report
            </button>
          </div>

          {/* Coming Soon Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6 opacity-60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <FaChartLine className="text-green-600 text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Spending Trends</h2>
                  <p className="text-gray-600">Track your spending over time</p>
                </div>
              </div>
              <div className="text-center py-8 text-gray-400">
                <p className="font-medium">Coming Soon</p>
                <p className="text-sm">Graphs showing spending patterns across months</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 opacity-60">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                  <FaChartBar className="text-purple-600 text-xl" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Category Analysis</h2>
                  <p className="text-gray-600">Deep dive into category spending</p>
                </div>
              </div>
              <div className="text-center py-8 text-gray-400">
                <p className="font-medium">Coming Soon</p>
                <p className="text-sm">Detailed breakdowns by category</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Report Modal */}
      {budget && (
        <MonthlyReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          budget={budget}
        />
      )}
    </DashboardLayout>
  );
}
