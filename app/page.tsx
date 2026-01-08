'use client';

import { useState, useEffect } from 'react';
import BudgetHeader from '@/components/BudgetHeader';
import BufferSection from '@/components/BufferSection';
import BudgetSection from '@/components/BudgetSection';
import BudgetSummary from '@/components/BudgetSummary';
import { Budget } from '@/types/budget';
import { transformDbBudgetToAppBudget } from '@/lib/budgetHelpers';

export default function Home() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth());
  const [year, setYear] = useState(currentDate.getFullYear());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBudget = async (m: number, y: number, showLoading = true) => {
    if (showLoading) {
      setLoading(true);
    }
    try {
      const response = await fetch(`/api/budgets?month=${m}&year=${y}`);
      const data = await response.json();
      const transformedBudget = transformDbBudgetToAppBudget(data);
      setBudget(transformedBudget);
    } catch (error) {
      console.error('Error fetching budget:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchBudget(month, year);
  }, [month, year]);

  const handleMonthChange = (newMonth: number, newYear: number) => {
    setMonth(newMonth);
    setYear(newYear);
  };

  const refreshBudget = () => {
    fetchBudget(month, year, false);
  };

  if (loading || !budget) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading budget...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <BudgetHeader
          month={budget.month}
          year={budget.year}
          onMonthChange={handleMonthChange}
        />

        <div className="mt-8 space-y-6">
          <BufferSection
            budgetId={budget.id}
            buffer={budget.buffer}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.income}
            onRefresh={refreshBudget}
            isIncome={true}
          />

          <BudgetSection
            category={budget.categories.giving}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.household}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.transportation}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.food}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.personal}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.insurance}
            onRefresh={refreshBudget}
          />

          <BudgetSection
            category={budget.categories.saving}
            onRefresh={refreshBudget}
          />

          <BudgetSummary budget={budget} />
        </div>
      </div>
    </div>
  );
}