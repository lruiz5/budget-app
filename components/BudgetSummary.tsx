"use client";

import { useState, useEffect, useCallback } from "react";
import { Budget, Transaction, BudgetItem } from "@/types/budget";
import { FaChartPie, FaReceipt, FaSync, FaCheck, FaTimes, FaUndo, FaPlus } from "react-icons/fa";
import { HiOutlineScissors } from "react-icons/hi2";
import AddTransactionModal, { TransactionToEdit } from "./AddTransactionModal";
import SplitTransactionModal from "./SplitTransactionModal";

interface SelectedBudgetItem {
  item: BudgetItem;
  categoryName: string;
}

interface BudgetSummaryProps {
  budget: Budget;
  onRefresh?: () => void;
  onTransactionClick?: (transaction: Transaction) => void;
  selectedBudgetItem?: SelectedBudgetItem | null;
  onCloseItemDetail?: () => void;
}

interface UncategorizedTransaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: 'income' | 'expense';
  merchant: string | null;
  status: string | null;
}

interface LinkedAccount {
  id: number;
  accountName: string;
  institutionName: string;
  lastFour: string;
  accountSubtype: string;
}

export default function BudgetSummary({ budget, onRefresh, onTransactionClick, selectedBudgetItem, onCloseItemDetail }: BudgetSummaryProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "transactions">(
    "summary"
  );
  const [transactionSubTab, setTransactionSubTab] = useState<"new" | "tracked" | "deleted">("new");
  const [uncategorizedTxns, setUncategorizedTxns] = useState<UncategorizedTransaction[]>([]);
  const [deletedTxns, setDeletedTxns] = useState<UncategorizedTransaction[]>([]);
  const [isLoadingUncategorized, setIsLoadingUncategorized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [transactionToEdit, setTransactionToEdit] = useState<TransactionToEdit | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [transactionToSplit, setTransactionToSplit] = useState<UncategorizedTransaction | null>(null);

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

  // Collect all transactions from all categories (including splits)
  const allTransactions: (Transaction | { isSplit: true; id: string; date: string; description: string; amount: number; type: 'income' | 'expense'; merchant?: string | null })[] = [];
  Object.entries(budget.categories).forEach(([, category]) => {
    category.items.forEach((item) => {
      item.transactions.forEach((transaction) => {
        allTransactions.push(transaction);
      });
      // Include split transactions
      item.splitTransactions?.forEach((split) => {
        allTransactions.push({
          isSplit: true,
          id: `split-${split.id}`,
          date: split.parentDate || '',
          description: split.description || split.parentDescription || 'Split transaction',
          amount: split.amount,
          type: split.parentType || 'expense',
          merchant: split.parentMerchant,
        });
      });
    });
  });

  // Sort transactions by date (most recent first)
  allTransactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const formatDate = (dateString: string) => {
    // Parse as local date to avoid timezone shift (YYYY-MM-DD format)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  };

  // Fetch uncategorized transactions
  const fetchUncategorized = useCallback(async () => {
    setIsLoadingUncategorized(true);
    try {
      const response = await fetch(`/api/teller/sync?month=${budget.month}&year=${budget.year}`);
      if (response.ok) {
        const data = await response.json();
        setUncategorizedTxns(data);
      }
    } catch (error) {
      console.error('Error fetching uncategorized transactions:', error);
    } finally {
      setIsLoadingUncategorized(false);
    }
  }, [budget.month, budget.year]);

  // Fetch deleted transactions
  const fetchDeleted = useCallback(async () => {
    try {
      const response = await fetch(`/api/transactions?deleted=true&month=${budget.month}&year=${budget.year}`);
      if (response.ok) {
        const data = await response.json();
        setDeletedTxns(data);
      }
    } catch (error) {
      console.error('Error fetching deleted transactions:', error);
    }
  }, [budget.month, budget.year]);

  // Fetch linked accounts
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
    fetchUncategorized();
    fetchDeleted();
    fetchLinkedAccounts();
  }, [fetchUncategorized, fetchDeleted, fetchLinkedAccounts]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/teller/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const result = await response.json();
        const messages = [];
        if (result.synced > 0) messages.push(`${result.synced} new`);
        if (result.updated > 0) messages.push(`${result.updated} updated`);
        if (messages.length > 0) {
          alert(`Synced: ${messages.join(', ')}`);
        } else {
          alert('No new transactions to sync');
        }
        await fetchUncategorized();
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error syncing:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAssign = async (transactionId: number) => {
    if (!selectedBudgetItemId) return;

    try {
      const response = await fetch('/api/transactions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: transactionId,
          budgetItemId: selectedBudgetItemId,
        }),
      });

      if (response.ok) {
        setUncategorizedTxns(uncategorizedTxns.filter(t => t.id !== transactionId));
        setAssigningId(null);
        setSelectedBudgetItemId('');
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error assigning transaction:', error);
    }
  };

  const handleDeleteUncategorized = async (transactionId: number) => {
    if (!confirm('Delete this transaction?')) return;

    try {
      const response = await fetch(`/api/transactions?id=${transactionId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Move to deleted list
        const deletedTxn = uncategorizedTxns.find(t => t.id === transactionId);
        if (deletedTxn) {
          setDeletedTxns([...deletedTxns, deletedTxn]);
        }
        setUncategorizedTxns(uncategorizedTxns.filter(t => t.id !== transactionId));
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const handleRestoreTransaction = async (transactionId: number) => {
    try {
      const response = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transactionId }),
      });

      if (response.ok) {
        // Move from deleted to uncategorized
        const restoredTxn = deletedTxns.find(t => t.id === transactionId);
        if (restoredTxn) {
          setUncategorizedTxns([...uncategorizedTxns, restoredTxn]);
        }
        setDeletedTxns(deletedTxns.filter(t => t.id !== transactionId));
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error restoring transaction:', error);
    }
  };

  const handlePermanentDelete = async (transactionId: number) => {
    if (!confirm('Permanently delete this transaction? This cannot be undone.')) return;

    try {
      // For permanent delete, we'd need a separate endpoint, but for now just remove from UI
      // The transaction stays in DB with deletedAt set
      setDeletedTxns(deletedTxns.filter(t => t.id !== transactionId));
    } catch (error) {
      console.error('Error permanently deleting transaction:', error);
    }
  };

  // Get all budget items for the dropdown
  const getAllBudgetItems = (): { category: string; items: BudgetItem[] }[] => {
    const categories = Object.entries(budget.categories).map(([, category]) => ({
      category: category.name,
      items: category.items,
    }));
    return categories.filter(c => c.items.length > 0);
  };

  const handleAddTransaction = async (transaction: {
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
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
        onRefresh?.();
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
        await fetchDeleted();
        onRefresh?.();
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const openEditModal = (transaction: Transaction) => {
    // Use the parent's click handler if provided, otherwise use local modal
    if (onTransactionClick) {
      onTransactionClick(transaction);
    } else {
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
      setIsAddModalOpen(true);
    }
  };

  const closeModal = () => {
    setIsAddModalOpen(false);
    setTransactionToEdit(null);
  };

  const openSplitModal = (txn: UncategorizedTransaction) => {
    setTransactionToSplit(txn);
    setIsSplitModalOpen(true);
  };

  const closeSplitModal = () => {
    setIsSplitModalOpen(false);
    setTransactionToSplit(null);
  };

  const handleSplitTransaction = async (splits: { budgetItemId: number; amount: number; description?: string }[]) => {
    if (!transactionToSplit) return;

    try {
      const response = await fetch('/api/transactions/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: transactionToSplit.id,
          splits,
        }),
      });

      if (response.ok) {
        // Remove from uncategorized list since it's now split
        setUncategorizedTxns(uncategorizedTxns.filter(t => t.id !== transactionToSplit.id));
        closeSplitModal();
        onRefresh?.();
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to split transaction');
      }
    } catch (error) {
      console.error('Error splitting transaction:', error);
      alert('Failed to split transaction');
    }
  };

  // Item Detail View - shown when a budget item is selected
  if (selectedBudgetItem) {
    const { item, categoryName } = selectedBudgetItem;
    const remaining = item.planned - item.actual;
    const progressPercent = item.planned > 0 ? Math.min((item.actual / item.planned) * 100, 100) : 0;
    const isOverBudget = item.actual > item.planned;

    // Combine and sort all transactions for this item
    const itemTransactions = [
      ...item.transactions.map(t => ({
        id: t.id,
        date: t.date,
        description: t.merchant || t.description,
        amount: t.amount,
        type: t.type,
        isSplit: false,
      })),
      ...(item.splitTransactions || []).map(s => ({
        id: `split-${s.id}`,
        date: s.parentDate || '',
        description: s.description || s.parentMerchant || s.parentDescription || 'Split',
        amount: s.amount,
        type: s.parentType || 'expense' as const,
        isSplit: true,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <div className="bg-white rounded-xl shadow-lg h-full flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onCloseItemDetail}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* Progress Circle and Remaining */}
          <div className="flex items-center gap-6 mb-4">
            <div className="relative w-20 h-20">
              <svg className="w-20 h-20 transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#e5e7eb"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke={isOverBudget ? "#ef4444" : "#22c55e"}
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - progressPercent / 100)}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-700">
                  {progressPercent.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="text-right flex-1">
              <p className="text-sm text-gray-500">Remaining</p>
              <p className={`text-3xl font-bold ${remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {remaining < 0 ? '-' : ''}${Math.abs(remaining).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Item Name */}
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{item.name}</h2>
          <p className="text-sm text-gray-500 mb-4">{categoryName}</p>

          {/* Spent of Planned */}
          <p className="text-base">
            <span className={isOverBudget ? 'text-red-600' : 'text-green-600'}>
              ${item.actual.toFixed(2)}
            </span>
            <span className="text-gray-500"> spent of </span>
            <span className="text-gray-900">${item.planned.toFixed(2)}</span>
          </p>

          {/* Recurring indicator or option */}
          {item.recurringPaymentId ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-blue-600">
              <span>🔄</span>
              <span>Recurring payment</span>
            </div>
          ) : (
            <button
              onClick={() => {
                // Navigate to recurring page with pre-filled data including budget item ID to link
                const params = new URLSearchParams({
                  name: item.name,
                  amount: item.planned.toString(),
                  category: categoryName.toLowerCase(),
                  budgetItemId: item.id,
                });
                window.location.href = `/recurring?${params.toString()}`;
              }}
              className="mt-4 flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors"
            >
              <span>🔄</span>
              <span>Make this recurring</span>
            </button>
          )}
        </div>

        {/* Activity This Month */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-base font-semibold text-gray-700 mb-4">
            Activity This Month
          </h3>

          {itemTransactions.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No transactions yet</p>
          ) : (
            <div className="space-y-3">
              {itemTransactions.map((txn) => (
                <div
                  key={txn.id}
                  className={`flex items-center justify-between py-2 ${txn.isSplit ? 'bg-purple-50 rounded px-2 -mx-2' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex flex-col items-center justify-center text-xs text-gray-500">
                      <span>{new Date(txn.date).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="font-semibold">{new Date(txn.date).getDate()}</span>
                    </div>
                    <div>
                      <p className="text-gray-900 text-sm">{txn.description}</p>
                      {txn.isSplit && (
                        <span className="text-xs text-purple-600">(split)</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-sm font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-gray-900'}`}>
                    {txn.type === 'income' ? '+' : '-'}${txn.amount.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab("summary")}
          className={`cursor-pointer flex-1 px-8 py-6 transition-colors flex flex-col items-center gap-3 ${
            activeTab === "summary"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FaChartPie className="text-3xl" />
          <span className="text-xl font-semibold">Summary</span>
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`cursor-pointer flex-1 px-8 py-6 transition-colors flex flex-col items-center gap-3 ${
            activeTab === "transactions"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          <FaReceipt className="text-3xl" />
          <span className="text-xl font-semibold">Transactions</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-8">
        {activeTab === "summary" ? (
          <div className="space-y-10">
            {/* Planned Section */}
            <div>
              <h3 className="text-xl font-semibold text-gray-700 mb-5">
                Planned
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 text-base">Buffer:</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${buffer.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 text-base">Total Income:</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${totalIncome.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 text-base">Total Expenses:</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${totalExpenses.toFixed(2)}
                  </span>
                </div>
                <div className="border-t-2 border-gray-300 pt-4 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900 text-base">
                      Remaining:
                    </span>
                    <span
                      className={`text-3xl font-bold ${
                        remainingToBudget < 0 ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      ${remainingToBudget.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actual Section */}
            <div>
              <h3 className="text-xl font-semibold text-gray-700 mb-5">
                Actual
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 text-base">Buffer:</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${buffer.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 text-base">Total Income:</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${totalActualIncome.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600 text-base">Total Expenses:</span>
                  <span className="text-xl font-semibold text-gray-900">
                    ${totalActualExpenses.toFixed(2)}
                  </span>
                </div>
                <div className="border-t-2 border-gray-300 pt-4 mt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900 text-base">
                      Remaining:
                    </span>
                    <span
                      className={`text-3xl font-bold ${
                        actualRemaining < 0 ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      ${actualRemaining.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full -m-8">
            {/* Sub-tabs */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4">
              <button
                onClick={() => setTransactionSubTab("new")}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  transactionSubTab === "new"
                    ? "text-orange-600 border-b-2 border-orange-600 -mb-[1px]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                New {uncategorizedTxns.length > 0 && `(${uncategorizedTxns.length})`}
              </button>
              <button
                onClick={() => setTransactionSubTab("tracked")}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  transactionSubTab === "tracked"
                    ? "text-blue-600 border-b-2 border-blue-600 -mb-[1px]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Tracked
              </button>
              <button
                onClick={() => setTransactionSubTab("deleted")}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  transactionSubTab === "deleted"
                    ? "text-gray-600 border-b-2 border-gray-600 -mb-[1px]"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                Deleted
              </button>
              {/* Sync button */}
              <div className="ml-auto flex items-center">
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded text-gray-600 disabled:opacity-50"
                >
                  <FaSync className={isSyncing ? 'animate-spin' : ''} size={12} />
                  Sync
                </button>
              </div>
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* New (Uncategorized) Tab */}
              {transactionSubTab === "new" && (
                <div className="space-y-3">
                  {uncategorizedTxns.length === 0 && !isLoadingUncategorized && (
                    <p className="text-gray-500 text-center py-12 text-base">
                      No new transactions. Click &quot;Sync&quot; to import from your bank.
                    </p>
                  )}
                  {isLoadingUncategorized && uncategorizedTxns.length === 0 && (
                    <p className="text-gray-500 text-center py-12 text-base">
                      Loading transactions...
                    </p>
                  )}
                  {uncategorizedTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className="bg-orange-50 border border-orange-100 rounded-lg p-3"
                    >
                      {assigningId === txn.id ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium truncate text-base">{txn.merchant || txn.description}</span>
                            <span className={`text-base font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                              {txn.type === 'income' ? '+' : '-'}${txn.amount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedBudgetItemId}
                              onChange={(e) => setSelectedBudgetItemId(e.target.value)}
                              className="flex-1 text-sm border rounded px-2 py-1.5"
                            >
                              <option value="">Select item...</option>
                              {getAllBudgetItems().map(({ category, items }) => (
                                <optgroup key={category} label={category}>
                                  {items.map(item => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                            <button
                              onClick={() => handleAssign(txn.id)}
                              disabled={!selectedBudgetItemId}
                              className="p-2 text-green-600 hover:bg-green-100 rounded disabled:opacity-50"
                            >
                              <FaCheck size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setAssigningId(null);
                                setSelectedBudgetItemId('');
                              }}
                              className="p-2 text-gray-500 hover:bg-gray-200 rounded"
                            >
                              <FaTimes size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">{formatDate(txn.date)}</span>
                              {txn.status === 'pending' && (
                                <span className="text-xs bg-yellow-200 text-yellow-700 px-1.5 py-0.5 rounded">pending</span>
                              )}
                            </div>
                            <p className="text-base text-gray-900 truncate mt-1">{txn.merchant || txn.description}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3">
                            <span className={`text-base font-medium ${txn.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                              {txn.type === 'income' ? '+' : '-'}${txn.amount.toFixed(2)}
                            </span>
                            <button
                              onClick={() => setAssigningId(txn.id)}
                              className="px-2 py-1 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded"
                            >
                              Assign
                            </button>
                            <button
                              onClick={() => openSplitModal(txn)}
                              className="p-1 text-purple-500 hover:bg-purple-100 rounded"
                              title="Split transaction"
                            >
                              <HiOutlineScissors size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteUncategorized(txn.id)}
                              className="p-1 text-red-400 hover:bg-red-100 rounded"
                            >
                              <FaTimes size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Tracked (Categorized) Tab */}
              {transactionSubTab === "tracked" && (
                <div className="space-y-3">
                  {allTransactions.length === 0 && (
                    <p className="text-gray-500 text-center py-12 text-base">
                      No tracked transactions yet.
                    </p>
                  )}
                  {allTransactions.map((transaction) => {
                    const isSplit = 'isSplit' in transaction && transaction.isSplit;
                    return (
                      <div
                        key={transaction.id}
                        onClick={() => !isSplit && openEditModal(transaction as Transaction)}
                        className={`border-b border-gray-100 pb-3 last:border-0 rounded px-2 -mx-2 py-2 transition-colors ${
                          isSplit ? 'bg-purple-50' : 'cursor-pointer hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500">
                                {transaction.date ? formatDate(transaction.date) : '—'}
                              </span>
                              {isSplit && (
                                <span className="text-xs text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">split</span>
                              )}
                            </div>
                            <p className="text-base text-gray-900 truncate mt-1">
                              {transaction.merchant || transaction.description}
                            </p>
                          </div>
                          <span className="text-base font-medium text-gray-900 ml-3">
                            ${Math.abs(transaction.amount).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Deleted Tab */}
              {transactionSubTab === "deleted" && (
                <div className="space-y-3">
                  {deletedTxns.length === 0 && (
                    <p className="text-gray-500 text-center py-12 text-base">
                      No deleted transactions.
                    </p>
                  )}
                  {deletedTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className="bg-gray-100 border border-gray-200 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">{formatDate(txn.date)}</span>
                          </div>
                          <p className="text-base text-gray-500 truncate line-through mt-1">
                            {txn.merchant || txn.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span className="text-base text-gray-400 line-through">
                            ${txn.amount.toFixed(2)}
                          </span>
                          <button
                            onClick={() => handleRestoreTransaction(txn.id)}
                            className="p-1.5 text-green-600 hover:bg-green-100 rounded"
                            title="Restore"
                          >
                            <FaUndo size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Floating Add Button */}
            <button
              onClick={() => {
                setTransactionToEdit(null);
                setIsAddModalOpen(true);
              }}
              className="fixed bottom-10 right-14 w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all"
              title="Add Transaction"
            >
              <FaPlus size={24} />
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Transaction Modal */}
      <AddTransactionModal
        isOpen={isAddModalOpen}
        onClose={closeModal}
        onAddTransaction={handleAddTransaction}
        onEditTransaction={handleEditTransaction}
        onDeleteTransaction={handleDeleteFromModal}
        budgetItems={getAllBudgetItems()}
        linkedAccounts={linkedAccounts}
        transactionToEdit={transactionToEdit}
      />

      {/* Split Transaction Modal */}
      <SplitTransactionModal
        isOpen={isSplitModalOpen}
        onClose={closeSplitModal}
        onSplit={handleSplitTransaction}
        transactionId={transactionToSplit?.id || 0}
        transactionAmount={transactionToSplit?.amount || 0}
        transactionDescription={transactionToSplit?.merchant || transactionToSplit?.description || ''}
        budgetItems={getAllBudgetItems()}
      />
    </div>
  );
}
