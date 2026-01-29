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

interface SelectedBudgetItem {
  item: BudgetItem;
  categoryName: string;
}

export default function Home() {
  const currentDate = new Date();
  const [month, setMonth] = useState(currentDate.getMonth());
  const [year, setYear] = useState(currentDate.getFullYear());
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);

  // Check if user needs onboarding
  useEffect(() => {
    async function checkOnboarding() {
      try {
        const res = await fetch('/api/onboarding');
        const { completed } = await res.json();
        if (!completed) {
          window.location.href = '/onboarding';
          return;
        }
      } catch {
        // If onboarding check fails, proceed to dashboard
      }
      setCheckingOnboarding(false);
    }
    checkOnboarding();
  }, []);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [transactionToEdit, setTransactionToEdit] = useState<TransactionToEdit | null>(null);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedBudgetItem, setSelectedBudgetItem] = useState<SelectedBudgetItem | null>(null);
  const [splitToEdit, setSplitToEdit] = useState<string | null>(null);

  const handleSplitClick = (parentTransactionId: string) => {
    setSplitToEdit(parentTransactionId);
  };

  const clearSplitToEdit = () => {
    setSplitToEdit(null);
  };

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

  // Handle clicking on a budget item to show details in sidebar
  const handleItemClick = (item: BudgetItem, categoryName: string) => {
    setSelectedBudgetItem({ item, categoryName });
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

  if (checkingOnboarding || loading || !budget) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <div className="text-xl text-text-secondary">Loading budget...</div>
        </div>
      </DashboardLayout>
    );
  }

  // Check if the budget is empty (no items in any category)
  const hasAnyItems = Object.values(budget.categories).some(
    (category) => category.items.length > 0
  );

  // Get month name helper
  const getMonthName = (monthIndex: number) => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[monthIndex];
  };

  // Get previous month name
  const getPreviousMonthName = (monthIndex: number) => {
    const prevMonth = monthIndex === 0 ? 11 : monthIndex - 1;
    return getMonthName(prevMonth);
  };

  // Handle copying from previous month
  const handleCopyFromPreviousMonth = async () => {
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;

    try {
      const response = await fetch('/api/budgets/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMonth: prevMonth,
          sourceYear: prevYear,
          targetMonth: month,
          targetYear: year,
        }),
      });

      if (response.ok) {
        refreshBudget();
      } else {
        console.error('Error copying budget');
      }
    } catch (error) {
      console.error('Error copying budget:', error);
    }
  };

  // If no items exist, show empty state
  if (!hasAnyItems) {
    return (
      <DashboardLayout>
        <div className="h-full flex overflow-hidden">
          {/* Main content area */}
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {/* Header - stretched wider */}
            <div className="px-4 sm:px-6 lg:px-8 pt-8">
              <BudgetHeader
                month={budget.month}
                year={budget.year}
                remainingToBudget={0}
                onMonthChange={handleMonthChange}
              />
            </div>

            {/* Empty state content */}
            <div className="mt-8 text-center">
                {/* Illustration */}
                <div className="flex items-center justify-center mb-8">
                  <img
                    src="/clone-budget.svg"
                    alt="Copy budget illustration"
                    className="w-80 h-80 opacity-60"
                  />
                </div>

                {/* Heading */}
                <h2 className="text-2xl font-semibold text-text-primary mb-3">
                  Hey there, looks like you need a budget for {getMonthName(budget.month)}.
                </h2>

                {/* Subtext */}
                <p className="text-text-secondary mb-6">
                  We&apos;ll <span className="font-semibold">copy {getPreviousMonthName(budget.month)}&apos;s budget</span> to get you started.
                </p>

                {/* CTA Button */}
                <button
                  onClick={handleCopyFromPreviousMonth}
                  className="px-8 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors"
                >
                  Start Planning for {getMonthName(budget.month)}
                </button>
            </div>
          </div>

          {/* Right sidebar placeholder */}
          <div className="w-xl bg-surface-secondary p-8"></div>
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
    <DashboardLayout>
      <div className="h-full flex overflow-hidden">
        {/* Main content area */}
        <div className="flex-1 overflow-y-auto hide-scrollbar">
          {/* Header - stretched wider */}
          <div className="px-4 sm:px-6 lg:px-8 pt-8">
            <BudgetHeader
              month={budget.month}
              year={budget.year}
              remainingToBudget={remainingToBudget}
              onMonthChange={handleMonthChange}
            />
          </div>

          {/* Budget content - constrained width */}
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6 pb-8">
              <BufferSection
                budgetId={budget.id}
                buffer={budget.buffer}
                onRefresh={refreshBudget}
              />

              <BudgetSection
                category={budget.categories.income}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.giving}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.household}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.transportation}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.food}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.personal}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.insurance}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              <BudgetSection
                category={budget.categories.saving}
                onRefresh={refreshBudget}
                onTransactionClick={handleTransactionClick}
                onSplitClick={handleSplitClick}
                onItemClick={handleItemClick}
                selectedItemId={selectedBudgetItem?.item.id}
              />

              {/* Add Group Button */}
              <button
                className="w-full py-3 border-2 border-dotted border-border-strong rounded-lg text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer"
              >
                + Add Group
              </button>
            </div>
          </div>
        </div>

        {/* Right sidebar for summary - fixed position */}
        <div className="w-xl bg-surface-secondary p-8 overflow-y-auto hide-scrollbar">
          <BudgetSummary
            budget={budget}
            onRefresh={refreshBudget}
            onTransactionClick={handleTransactionClick}
            selectedBudgetItem={selectedBudgetItem}
            onCloseItemDetail={() => setSelectedBudgetItem(null)}
            splitToEdit={splitToEdit}
            onClearSplitToEdit={clearSplitToEdit}
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
