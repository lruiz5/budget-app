"use client";

import { useState, useEffect, useCallback } from "react";
import BudgetHeader from "@/components/BudgetHeader";
import BufferSection from "@/components/BufferSection";
import BudgetSection from "@/components/BudgetSection";
import BudgetSummary from "@/components/BudgetSummary";
import AddTransactionModal, { TransactionToEdit } from "@/components/AddTransactionModal";
import MonthlyReportModal from "@/components/MonthlyReportModal";
import DashboardLayout from "@/components/DashboardLayout";
import { Budget, Transaction, BudgetItem } from "@/types/budget";
import { transformDbBudgetToAppBudget } from "@/lib/budgetHelpers";

interface LinkedAccount {
  id: number;
  accountName: string;
  institutionName: string;
  lastFour: string;
  accountSubtype: string;
}

export default function Home() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth());
  const [year, setYear] = useState(currentDate.getFullYear());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<TransactionToEdit | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const fetchLinkedAccounts = useCallback(async () => {
    try {
      const response = await fetch('/api/teller/accounts');
      if (response.ok) {
        const data = await response.json();
        setLinkedAccounts(data);
      }
    } catch (error) {
      console.error('Error fetching linked accounts:', error);
    }
  }, []);

  useEffect(() => {
    fetchLinkedAccounts();
  }, [fetchLinkedAccounts]);

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
      console.error("Error fetching budget:", error);
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

  // Get all budget items for the dropdown
  const getAllBudgetItems = (): { category: string; items: BudgetItem[] }[] => {
    if (!budget) return [];
    const categories = Object.entries(budget.categories).map(([, category]) => ({
      category: category.name,
      items: category.items,
    }));
    return categories.filter(c => c.items.length > 0);
  };

  // Handle clicking on a transaction to edit it
  const handleTransactionClick = (transaction: Transaction) => {
    setTransactionToEdit({
      id: parseInt(transaction.id),
      budgetItemId: transaction.budgetItemId ? parseInt(transaction.budgetItemId) : null,
      linkedAccountId: transaction.linkedAccountId,
      date: transaction.date,
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      merchant: transaction.merchant,
    });
    setIsEditModalOpen(true);
  };

  const handleEditTransaction = async (transaction: {
    id: number;
    budgetItemId: string;
    linkedAccountId?: number;
    date: string;
    description: string;
    amount: number;
    type: 'income' | 'expense';
    merchant?: string;
  }) => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        setTransactionToEdit(null);
        setIsEditModalOpen(false);
        refreshBudget();
      }
    } catch (error) {
      console.error('Error editing transaction:', error);
    }
  };

  const handleDeleteFromModal = async (id: number) => {
    try {
      const response = await fetch(`/api/transactions?id=${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTransactionToEdit(null);
        setIsEditModalOpen(false);
        refreshBudget();
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setTransactionToEdit(null);
  };

  if (loading || !budget) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <div className="text-xl text-gray-600">Loading budget...</div>
        </div>
      </DashboardLayout>
    );
  }

  // Check if the budget is empty (no items in any category)
  const hasAnyItems = Object.values(budget.categories).some(
    (category) => category.items.length > 0
  );

  // If no items exist, show empty state
  if (!hasAnyItems) {
    return (
      <DashboardLayout onOpenMonthlyReport={() => setIsReportModalOpen(true)}>
        <div className="h-full flex overflow-hidden">
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <BudgetHeader
                month={budget.month}
                year={budget.year}
                remainingToBudget={0}
                onMonthChange={handleMonthChange}
              />
              <div className="mt-16 text-center">
                <p className="text-gray-500 text-lg">No budget set for this month.</p>
                <p className="text-gray-400 text-sm mt-2">
                  Add income and expense categories to start planning.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Calculate remaining to budget
  const totalPlannedIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.planned,
    0
  );
  const totalPlannedExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== 'income')
    .reduce((sum, [, category]) => {
      return sum + category.items.reduce((catSum, item) => catSum + item.planned, 0);
    }, 0);
  const totalAvailable = (budget.buffer || 0) + totalPlannedIncome;
  const remainingToBudget = totalAvailable - totalPlannedExpenses;

  return (
    <DashboardLayout onOpenMonthlyReport={() => setIsReportModalOpen(true)}>
      <div className="h-full flex overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <BudgetHeader
              month={budget.month}
              year={budget.year}
              remainingToBudget={remainingToBudget}
              onMonthChange={handleMonthChange}
            />

            <div className="mt-8 space-y-6 pb-8">
              <BufferSection
                budgetId={budget.id}
                buffer={budget.buffer}
                onRefresh={refreshBudget}
              />

              <BudgetSection
                category={budget.categories.income}
                onRefresh={refreshBudget}
                isIncome={true}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.giving}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.household}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.transportation}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.food}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.personal}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.insurance}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />

              <BudgetSection
                category={budget.categories.saving}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
              />
            </div>
          </div>
        </div>

        {/* Right sidebar for summary - fixed position */}
        <div className="w-xl bg-gray-50 p-8 overflow-y-auto hide-scrollbar">
          <BudgetSummary
            budget={budget}
            onRefresh={refreshBudget}
            onTransactionClick={handleTransactionClick}
          />
        </div>

        {/* Edit Transaction Modal (from line items) */}
        {isEditModalOpen && (
          <AddTransactionModal
            isOpen={isEditModalOpen}
            onClose={closeEditModal}
            onAddTransaction={() => {}}
            onEditTransaction={handleEditTransaction}
            onDeleteTransaction={handleDeleteFromModal}
            budgetItems={getAllBudgetItems()}
            linkedAccounts={linkedAccounts}
            transactionToEdit={transactionToEdit}
          />
        )}

        {/* Monthly Report Modal */}
        <MonthlyReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          budget={budget}
        />
      </div>
    </DashboardLayout>
  );
}
