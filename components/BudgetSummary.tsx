"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Budget, Transaction, BudgetItem } from "@/types/budget";
import {
  FaChartPie,
  FaReceipt,
  FaSync,
  FaCheck,
  FaTimes,
  FaUndo,
  FaPlus,
} from "react-icons/fa";
import { HiOutlineScissors } from "react-icons/hi2";
import AddTransactionModal, { TransactionToEdit } from "./AddTransactionModal";
import SplitTransactionModal, { ExistingSplit } from "./SplitTransactionModal";
import { useToast } from "@/contexts/ToastContext";
import { useUncategorizedCount } from "@/contexts/UncategorizedCountContext";
import { formatCurrency } from "@/lib/formatCurrency";

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
  splitToEdit?: string | null;
  onClearSplitToEdit?: () => void;
}

interface UncategorizedTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  merchant: string | null;
  status: string | null;
  suggestedBudgetItemId?: number | null;
}

interface LinkedAccount {
  id: string;
  accountName: string;
  institutionName: string;
  lastFour: string;
  accountSubtype: string;
}

export default function BudgetSummary({
  budget,
  onRefresh,
  onTransactionClick,
  selectedBudgetItem,
  onCloseItemDetail,
  splitToEdit,
  onClearSplitToEdit,
}: BudgetSummaryProps) {
  const toast = useToast();
  const { setCount: setUncategorizedCount } = useUncategorizedCount();
  const [activeTab, setActiveTab] = useState<"summary" | "transactions">(
    "summary",
  );
  const [transactionSubTab, setTransactionSubTab] = useState<
    "new" | "tracked" | "deleted"
  >("new");
  const [uncategorizedTxns, setUncategorizedTxns] = useState<
    UncategorizedTransaction[]
  >([]);
  const [deletedTxns, setDeletedTxns] = useState<UncategorizedTransaction[]>(
    [],
  );
  const [isLoadingUncategorized, setIsLoadingUncategorized] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [selectedBudgetItemId, setSelectedBudgetItemId] = useState<string>("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [transactionToEdit, setTransactionToEdit] =
    useState<TransactionToEdit | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [transactionToSplit, setTransactionToSplit] =
    useState<UncategorizedTransaction | null>(null);
  const [existingSplits, setExistingSplits] = useState<ExistingSplit[]>([]);
  const [defaultBudgetItemId, setDefaultBudgetItemId] = useState<string>('');
  const [defaultType, setDefaultType] = useState<'income' | 'expense'>('expense');

  const buffer = budget.buffer || 0;

  const totalIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.planned,
    0,
  );

  const totalPlannedSavings = budget.categories.saving
    ? budget.categories.saving.items.reduce((sum, item) => sum + item.planned, 0)
    : 0;

  const totalExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== "income" && key !== "saving")
    .reduce((sum, [, category]) => {
      return (
        sum + category.items.reduce((catSum, item) => catSum + item.planned, 0)
      );
    }, 0);

  const totalAvailable = buffer + totalIncome;
  const remainingToBudget = totalAvailable - totalExpenses - totalPlannedSavings;

  const totalActualIncome = budget.categories.income.items.reduce(
    (sum, item) => sum + item.actual,
    0,
  );

  const totalActualSavings = budget.categories.saving
    ? budget.categories.saving.items.reduce((sum, item) => sum + item.actual, 0)
    : 0;

  const totalActualExpenses = Object.entries(budget.categories)
    .filter(([key]) => key !== "income" && key !== "saving")
    .reduce((sum, [, category]) => {
      return (
        sum + category.items.reduce((catSum, item) => catSum + item.actual, 0)
      );
    }, 0);

  const totalActualAvailable = buffer + totalActualIncome;
  const actualRemaining = totalActualAvailable - totalActualExpenses - totalActualSavings;

  // Fetch parent transaction and its splits, then open split modal for editing
  const fetchAndOpenSplitModal = async (parentTransactionId: string) => {
    try {
      // Fetch parent transaction and its splits in parallel
      const [txnResponse, splitsResponse] = await Promise.all([
        fetch(`/api/transactions?id=${parentTransactionId}`),
        fetch(`/api/transactions/split?transactionId=${parentTransactionId}`),
      ]);

      if (txnResponse.ok && splitsResponse.ok) {
        const parentTxn = await txnResponse.json();
        const splits = await splitsResponse.json();

        // Set up the transaction to split
        setTransactionToSplit({
          id: parentTxn.id,
          date: parentTxn.date,
          description: parentTxn.description,
          amount: parentTxn.amount,
          type: parentTxn.type,
          merchant: parentTxn.merchant,
          status: null,
        });
        setExistingSplits(splits);
        setIsSplitModalOpen(true);
      }
    } catch (error) {
      console.error("Error fetching split transaction data:", error);
    }
  };

  // Collect all transactions from all categories (including splits)
  const allTransactions: (
    | Transaction
    | {
        isSplit: true;
        id: string;
        date: string;
        description: string;
        amount: number;
        type: "income" | "expense";
        merchant?: string | null;
        parentTransactionId: string;
      }
  )[] = [];
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
          date: split.parentDate || "",
          description:
            split.description || split.parentDescription || "Split transaction",
          amount: split.amount,
          type: split.parentType || "expense",
          merchant: split.parentMerchant,
          parentTransactionId: split.parentTransactionId,
        });
      });
    });
  });

  // Sort transactions by date (most recent first)
  allTransactions.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const formatDate = (dateString: string) => {
    // Parse as local date to avoid timezone shift (YYYY-MM-DD format)
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
  };

  // Fetch uncategorized transactions
  const fetchUncategorized = useCallback(async () => {
    setIsLoadingUncategorized(true);
    try {
      const response = await fetch(`/api/teller/sync`);
      if (response.ok) {
        const data = await response.json();
        setUncategorizedTxns(data);
      }
    } catch (error) {
      console.error("Error fetching uncategorized transactions:", error);
    } finally {
      setIsLoadingUncategorized(false);
    }
  }, [budget.month, budget.year]);

  // Filter uncategorized transactions to 7 days before/after the current month
  const filteredUncategorizedTxns = useMemo(() => {
    const curM = budget.month; // 0-indexed
    const curY = budget.year;
    // First day of current month
    const monthStart = new Date(curY, curM, 1);
    // Last day of current month
    const monthEnd = new Date(curY, curM + 1, 0);
    // 7 days before month start
    const rangeStart = new Date(monthStart);
    rangeStart.setDate(rangeStart.getDate() - 7);
    const startStr = rangeStart.toISOString().slice(0, 10);
    // 7 days after month end
    const rangeEnd = new Date(monthEnd);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    const endStr = rangeEnd.toISOString().slice(0, 10);

    return uncategorizedTxns.filter(txn => txn.date >= startStr && txn.date <= endStr);
  }, [uncategorizedTxns, budget.month, budget.year]);

  // Update the badge count to match filtered transactions
  useEffect(() => {
    setUncategorizedCount(filteredUncategorizedTxns.length);
  }, [filteredUncategorizedTxns, setUncategorizedCount]);

  // Fetch deleted transactions
  const fetchDeleted = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/transactions?deleted=true&month=${budget.month}&year=${budget.year}`,
      );
      if (response.ok) {
        const data = await response.json();
        setDeletedTxns(data);
      }
    } catch (error) {
      console.error("Error fetching deleted transactions:", error);
    }
  }, [budget.month, budget.year]);

  // Fetch linked accounts
  const fetchLinkedAccounts = useCallback(async () => {
    try {
      const response = await fetch("/api/teller/accounts");
      if (response.ok) {
        const data = await response.json();
        setLinkedAccounts(data);
      }
    } catch (error) {
      console.error("Error fetching linked accounts:", error);
    }
  }, []);

  useEffect(() => {
    fetchUncategorized();
    fetchDeleted();
    fetchLinkedAccounts();
  }, [fetchUncategorized, fetchDeleted, fetchLinkedAccounts]);

  // Handle external split edit request (from BudgetSection dropdown)
  useEffect(() => {
    if (splitToEdit) {
      fetchAndOpenSplitModal(splitToEdit);
      onClearSplitToEdit?.();
    }
  }, [splitToEdit, onClearSplitToEdit]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/teller/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (response.ok) {
        const result = await response.json();
        const messages = [];
        if (result.synced > 0) messages.push(`${result.synced} new`);
        if (result.updated > 0) messages.push(`${result.updated} updated`);
        if (messages.length > 0) {
          toast.success(`Synced: ${messages.join(", ")}`);
        } else {
          toast.info("No new transactions to sync");
        }
        await fetchUncategorized();
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error syncing:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAssign = async (transactionId: string) => {
    if (!selectedBudgetItemId) return;

    try {
      const response = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: transactionId,
          budgetItemId: selectedBudgetItemId,
        }),
      });

      if (response.ok) {
        setUncategorizedTxns(
          uncategorizedTxns.filter((t) => t.id !== transactionId),
        );
        setAssigningId(null);
        setSelectedBudgetItemId("");
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error assigning transaction:", error);
    }
  };

  const handleDeleteUncategorized = async (transactionId: string) => {
    if (!confirm("Delete this transaction?")) return;

    try {
      const response = await fetch(`/api/transactions?id=${transactionId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Move to deleted list
        const deletedTxn = uncategorizedTxns.find(
          (t) => t.id === transactionId,
        );
        if (deletedTxn) {
          setDeletedTxns([...deletedTxns, deletedTxn]);
        }
        setUncategorizedTxns(
          uncategorizedTxns.filter((t) => t.id !== transactionId),
        );
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const handleRestoreTransaction = async (transactionId: string) => {
    try {
      const response = await fetch("/api/transactions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: transactionId }),
      });

      if (response.ok) {
        // Move from deleted to uncategorized
        const restoredTxn = deletedTxns.find((t) => t.id === transactionId);
        if (restoredTxn) {
          setUncategorizedTxns([...uncategorizedTxns, restoredTxn]);
        }
        setDeletedTxns(deletedTxns.filter((t) => t.id !== transactionId));
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error restoring transaction:", error);
    }
  };

  const handlePermanentDelete = async (transactionId: string) => {
    if (!confirm("Permanently delete this transaction? This cannot be undone."))
      return;

    try {
      // For permanent delete, we'd need a separate endpoint, but for now just remove from UI
      // The transaction stays in DB with deletedAt set
      setDeletedTxns(deletedTxns.filter((t) => t.id !== transactionId));
    } catch (error) {
      console.error("Error permanently deleting transaction:", error);
    }
  };

  // Look up a budget item name by ID for suggestion badges
  const getBudgetItemName = (itemId: number): string | null => {
    for (const category of Object.values(budget.categories)) {
      for (const item of category.items) {
        if (String(item.id) === String(itemId)) return item.name;
      }
    }
    return null;
  };

  // Get all budget items for the dropdown
  const getAllBudgetItems = (): { category: string; items: BudgetItem[] }[] => {
    const categories = Object.entries(budget.categories).map(
      ([, category]) => ({
        category: category.name,
        items: category.items,
      }),
    );
    return categories.filter((c) => c.items.length > 0);
  };

  const handleAddTransaction = async (transaction: {
    budgetItemId: string;
    linkedAccountId?: string;
    date: string;
    description: string;
    amount: number;
    type: "income" | "expense";
    merchant?: string;
  }) => {
    try {
      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  const handleEditTransaction = async (transaction: {
    id: string;
    budgetItemId: string;
    linkedAccountId?: string;
    date: string;
    description: string;
    amount: number;
    type: "income" | "expense";
    merchant?: string;
  }) => {
    try {
      const response = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transaction),
      });

      if (response.ok) {
        setTransactionToEdit(null);
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error editing transaction:", error);
    }
  };

  const handleDeleteFromModal = async (id: string) => {
    try {
      const response = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setTransactionToEdit(null);
        await fetchDeleted();
        onRefresh?.();
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const openEditModal = (transaction: Transaction) => {
    // Use the parent's click handler if provided, otherwise use local modal
    if (onTransactionClick) {
      onTransactionClick(transaction);
    } else {
      setTransactionToEdit({
        id: transaction.id,
        budgetItemId: transaction.budgetItemId || null,
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
    setDefaultBudgetItemId('');
    setDefaultType('expense');
  };

  const openSplitModal = (txn: UncategorizedTransaction) => {
    setTransactionToSplit(txn);
    setExistingSplits([]); // Clear any existing splits for new split creation
    setIsSplitModalOpen(true);
  };

  const closeSplitModal = () => {
    setIsSplitModalOpen(false);
    setTransactionToSplit(null);
    setExistingSplits([]);
  };

  const handleSplitTransaction = async (
    splits: { budgetItemId: string; amount: number; description?: string }[],
  ) => {
    if (!transactionToSplit) return;

    try {
      const response = await fetch("/api/transactions/split", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: transactionToSplit.id,
          splits,
        }),
      });

      if (response.ok) {
        // Remove from uncategorized list since it's now split
        setUncategorizedTxns(
          uncategorizedTxns.filter((t) => t.id !== transactionToSplit.id),
        );
        closeSplitModal();
        onRefresh?.();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to split transaction");
      }
    } catch (error) {
      console.error("Error splitting transaction:", error);
      toast.error("Failed to split transaction");
    }
  };

  // Item Detail View - shown when a budget item is selected
  if (selectedBudgetItem) {
    const { item, categoryName } = selectedBudgetItem;
    const remaining = item.planned - item.actual;
    const progressPercent =
      item.planned > 0 ? Math.min((item.actual / item.planned) * 100, 100) : 0;
    const isOverBudget = item.actual > item.planned;

    // Combine and sort all transactions for this item
    const itemTransactions = [
      ...item.transactions.map((t) => ({
        id: t.id,
        date: t.date,
        description: t.merchant || t.description,
        amount: t.amount,
        type: t.type,
        isSplit: false,
        originalTransaction: t, // Keep full transaction for editing
        parentTransactionId: null as string | null,
      })),
      ...(item.splitTransactions || []).map((s) => ({
        id: `split-${s.id}`,
        date: s.parentDate || "",
        description:
          s.description || s.parentMerchant || s.parentDescription || "Split",
        amount: s.amount,
        type: s.parentType || ("expense" as const),
        isSplit: true,
        originalTransaction: null,
        parentTransactionId: s.parentTransactionId,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
      <div className="bg-surface rounded-xl shadow-lg h-full flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={onCloseItemDetail}
              className="text-text-tertiary hover:text-text-secondary transition-colors"
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
                <span className="text-lg font-bold text-text-secondary">
                  {progressPercent.toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="text-right flex-1">
              <p className="text-sm text-text-secondary">Remaining</p>
              <p
                className={`text-3xl font-bold ${remaining < 0 ? "text-danger" : "text-text-primary"}`}
              >
                {remaining < 0 ? "-" : ""}${formatCurrency(Math.abs(remaining))}
              </p>
            </div>
          </div>

          {/* Item Name */}
          <h2 className="text-2xl font-bold text-text-primary mb-1">
            {item.name}
          </h2>
          <p className="text-sm text-text-secondary mb-4">{categoryName}</p>

          {/* Spent of Planned */}
          <p className="text-base">
            <span className={isOverBudget ? "text-danger" : "text-success"}>
              ${formatCurrency(item.actual)}
            </span>
            <span className="text-text-secondary"> spent of </span>
            <span className="text-text-primary">
              ${formatCurrency(item.planned)}
            </span>
          </p>

          {/* Recurring indicator or option */}
          {item.recurringPaymentId ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-primary">
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
              className="mt-4 flex items-center gap-2 text-sm text-text-secondary hover:text-primary transition-colors"
            >
              <span>🔄</span>
              <span>Make this recurring</span>
            </button>
          )}

          {/* Add Transaction Button */}
          <button
            onClick={() => {
              const isIncome = categoryName.toLowerCase() === 'income';
              setDefaultBudgetItemId(item.id);
              setDefaultType(isIncome ? 'income' : 'expense');
              setTransactionToEdit(null);
              setIsAddModalOpen(true);
            }}
            className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
          >
            <FaPlus size={12} />
            <span>Add Transaction</span>
          </button>
        </div>

        {/* Activity This Month */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-base font-semibold text-text-secondary mb-4">
            Activity This Month
          </h3>

          {itemTransactions.length === 0 ? (
            <p className="text-text-secondary text-center py-8">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-3">
              {itemTransactions.map((txn) => (
                <div
                  key={txn.id}
                  onClick={() => {
                    if (txn.isSplit && txn.parentTransactionId) {
                      fetchAndOpenSplitModal(txn.parentTransactionId);
                    } else if (
                      !txn.isSplit &&
                      txn.originalTransaction &&
                      onTransactionClick
                    ) {
                      onTransactionClick(txn.originalTransaction);
                    }
                  }}
                  className="flex items-center justify-between py-2 rounded px-2 -mx-2 transition-colors cursor-pointer hover:bg-surface-secondary"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-surface-secondary rounded-full flex flex-col items-center justify-center text-xs text-text-secondary">
                      <span>
                        {new Date(txn.date).toLocaleDateString("en-US", {
                          month: "short",
                        })}
                      </span>
                      <span className="font-semibold">
                        {new Date(txn.date).getDate()}
                      </span>
                    </div>
                    <div>
                      <p className="text-text-primary text-sm">
                        {txn.description}
                      </p>
                      {txn.isSplit && (
                        <span className="text-xs text-accent-purple">
                          (split)
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-sm font-medium ${txn.type === "income" ? "text-success" : "text-text-primary"}`}
                  >
                    {txn.type === "income" ? "+" : "-"}${formatCurrency(txn.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Split Transaction Modal - also needed in Item Detail View */}
        <SplitTransactionModal
          isOpen={isSplitModalOpen}
          onClose={closeSplitModal}
          onSplit={handleSplitTransaction}
          transactionId={transactionToSplit?.id || ''}
          transactionAmount={transactionToSplit?.amount || 0}
          transactionDescription={
            transactionToSplit?.merchant ||
            transactionToSplit?.description ||
            ""
          }
          budgetItems={getAllBudgetItems()}
          existingSplits={existingSplits}
        />
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-xl shadow-lg h-full flex flex-col">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("summary")}
          className={`cursor-pointer flex-1 px-8 py-6 transition-colors flex flex-col items-center gap-3 ${
            activeTab === "summary"
              ? "text-primary border-b-2 border-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <span
            className={`w-14 h-14 rounded-full flex items-center justify-center ${
              activeTab === "summary"
                ? "bg-primary-light"
                : "bg-surface-secondary"
            }`}
          >
            <FaChartPie className="text-2xl" />
          </span>
          <span className="text-xl font-semibold">Summary</span>
        </button>
        <button
          onClick={() => setActiveTab("transactions")}
          className={`cursor-pointer flex-1 px-8 py-6 transition-colors flex flex-col items-center gap-3 ${
            activeTab === "transactions"
              ? "text-primary border-b-2 border-primary"
              : "text-text-secondary hover:text-text-primary"
          }`}
        >
          <span
            className={`relative w-14 h-14 rounded-full flex items-center justify-center ${
              activeTab === "transactions"
                ? "bg-primary-light"
                : "bg-surface-secondary"
            }`}
          >
            <FaReceipt className="text-2xl" />
            {filteredUncategorizedTxns.length > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 flex items-center justify-center bg-accent-orange text-white text-xs font-bold rounded-full px-1">
                {filteredUncategorizedTxns.length > 99
                  ? "99+"
                  : filteredUncategorizedTxns.length}
              </span>
            )}
          </span>
          <span className="text-xl font-semibold">Transactions</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-8">
        {activeTab === "summary" ? (
          <div className="space-y-10">
            {/* Planned Section */}
            <div>
              <h3 className="text-xl font-semibold text-text-secondary mb-5">
                Planned
              </h3>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">Buffer:</span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(buffer)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">
                    Total Income:
                  </span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(totalIncome)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">
                    Total Expenses:
                  </span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(totalExpenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">
                    Total Savings:
                  </span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(totalPlannedSavings)}
                  </span>
                </div>
                <div className="border-t-2 border-border-strong pt-4 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-text-primary text-base">
                      Remaining:
                    </span>
                    <span
                      className={`text-3xl font-bold ${
                        remainingToBudget < 0
                          ? "text-danger"
                          : "text-text-primary"
                      }`}
                    >
                      ${formatCurrency(remainingToBudget)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actual Section */}
            <div>
              <h3 className="text-xl font-semibold text-text-secondary mb-5">
                Actual
              </h3>
              <div className="space-y-1">
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">Buffer:</span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(buffer)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">
                    Total Income:
                  </span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(totalActualIncome)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">
                    Total Expenses:
                  </span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(totalActualExpenses)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-text-secondary text-base">
                    Total Savings:
                  </span>
                  <span className="text-xl font-semibold text-text-primary">
                    ${formatCurrency(totalActualSavings)}
                  </span>
                </div>
                <div className="border-t-2 border-border-strong pt-4 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-text-primary text-base">
                      Remaining:
                    </span>
                    <span
                      className={`text-3xl font-bold ${
                        actualRemaining < 0
                          ? "text-danger"
                          : "text-text-primary"
                      }`}
                    >
                      ${formatCurrency(actualRemaining)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full -m-8">
            {/* Sub-tabs */}
            <div className="flex border-b border-border bg-surface-secondary px-4">
              <button
                onClick={() => setTransactionSubTab("new")}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  transactionSubTab === "new"
                    ? "text-accent-orange border-b-2 border-accent-orange -mb-px"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                New{" "}
                {filteredUncategorizedTxns.length > 0 &&
                  `(${filteredUncategorizedTxns.length})`}
              </button>
              <button
                onClick={() => setTransactionSubTab("tracked")}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  transactionSubTab === "tracked"
                    ? "text-primary border-b-2 border-primary -mb-px"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Tracked
              </button>
              <button
                onClick={() => setTransactionSubTab("deleted")}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  transactionSubTab === "deleted"
                    ? "text-text-secondary border-b-2 border-text-secondary -mb-px"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Deleted
              </button>
              {/* Sync button */}
              <div className="ml-auto flex items-center">
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-surface-secondary hover:bg-surface-secondary rounded text-text-secondary disabled:opacity-50"
                >
                  <FaSync
                    className={isSyncing ? "animate-spin" : ""}
                    size={12}
                  />
                  Sync
                </button>
              </div>
            </div>

            {/* Sub-tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* New (Uncategorized) Tab */}
              {transactionSubTab === "new" && (
                <div className="space-y-3">
                  {filteredUncategorizedTxns.length === 0 &&
                    !isLoadingUncategorized && (
                      <p className="text-text-secondary text-center py-12 text-base">
                        No new transactions. Click &quot;Sync&quot; to import
                        from your bank.
                      </p>
                    )}
                  {isLoadingUncategorized && filteredUncategorizedTxns.length === 0 && (
                    <p className="text-text-secondary text-center py-12 text-base">
                      Loading transactions...
                    </p>
                  )}
                  {/* Group filtered transactions by month, newest first */}
                  {(() => {
                    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                    const grouped: Record<string, UncategorizedTransaction[]> = {};
                    for (const txn of filteredUncategorizedTxns) {
                      const [y, m] = txn.date.split('-').map(Number);
                      const key = `${y}-${String(m).padStart(2, '0')}`;
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(txn);
                    }
                    const sortedKeys = Object.keys(grouped).sort().reverse();
                    const multipleMonths = sortedKeys.length > 1;

                    return sortedKeys.map((key) => {
                      const [y, m] = key.split('-').map(Number);
                      const label = `${monthNames[m - 1]} ${y}`;
                      const txns = grouped[key];

                      return (
                        <div key={key}>
                          {multipleMonths && (
                            <div className="mb-2 mt-4 first:mt-0">
                              <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">
                                {label}
                              </h4>
                            </div>
                          )}
                          {txns.map((txn) => (
                            <div
                              key={txn.id}
                              className="bg-accent-orange-light border border-accent-orange-border rounded-lg p-3 mb-3 last:mb-0"
                            >
                              {assigningId === txn.id ? (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium truncate text-base">
                                      {txn.merchant || txn.description}
                                    </span>
                                    <span
                                      className={`text-base font-medium ${txn.type === "income" ? "text-success" : "text-danger"}`}
                                    >
                                      {txn.type === "income" ? "+" : "-"}$
                                      {formatCurrency(txn.amount)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={selectedBudgetItemId}
                                      onChange={(e) =>
                                        setSelectedBudgetItemId(e.target.value)
                                      }
                                      className="flex-1 text-sm border rounded px-2 py-1.5"
                                    >
                                      <option value="">Select item...</option>
                                      {getAllBudgetItems().map(
                                        ({ category, items }) => (
                                          <optgroup key={category} label={category}>
                                            {items.map((item) => (
                                              <option key={item.id} value={item.id}>
                                                {item.name}
                                              </option>
                                            ))}
                                          </optgroup>
                                        ),
                                      )}
                                    </select>
                                    <button
                                      onClick={() => handleAssign(txn.id)}
                                      disabled={!selectedBudgetItemId}
                                      className="p-2 text-success hover:bg-success-light rounded disabled:opacity-50"
                                    >
                                      <FaCheck size={14} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAssigningId(null);
                                        setSelectedBudgetItemId("");
                                      }}
                                      className="p-2 text-text-secondary hover:bg-surface-secondary rounded"
                                    >
                                      <FaTimes size={14} />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm text-text-secondary">
                                        {formatDate(txn.date)}
                                      </span>
                                      {txn.status === "pending" && (
                                        <span className="text-xs bg-warning-light text-warning px-1.5 py-0.5 rounded">
                                          pending
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-base text-text-primary truncate mt-1">
                                      {txn.merchant || txn.description}
                                    </p>
                                    {txn.suggestedBudgetItemId && getBudgetItemName(txn.suggestedBudgetItemId) && (
                                      <button
                                        onClick={() => {
                                          setAssigningId(txn.id);
                                          setSelectedBudgetItemId(String(txn.suggestedBudgetItemId));
                                        }}
                                        className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-primary bg-primary-light rounded-full hover:bg-primary hover:text-white transition-colors"
                                      >
                                        {getBudgetItemName(txn.suggestedBudgetItemId!)}
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 ml-3">
                                    <span
                                      className={`text-base font-medium ${txn.type === "income" ? "text-success" : "text-danger"}`}
                                    >
                                      {txn.type === "income" ? "+" : "-"}$
                                      {formatCurrency(txn.amount)}
                                    </span>
                                    <button
                                      onClick={() => setAssigningId(txn.id)}
                                      className="px-2 py-1 text-xs text-primary bg-primary-light hover:bg-primary-light rounded"
                                    >
                                      Assign
                                    </button>
                                    <button
                                      onClick={() => openSplitModal(txn)}
                                      className="p-1 text-accent-purple hover:bg-accent-purple-light rounded"
                                      title="Split transaction"
                                    >
                                      <HiOutlineScissors size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteUncategorized(txn.id)}
                                      className="p-1 text-danger hover:bg-danger-light rounded"
                                    >
                                      <FaTimes size={12} />
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Tracked (Categorized) Tab */}
              {transactionSubTab === "tracked" && (
                <div className="space-y-3">
                  {allTransactions.length === 0 && (
                    <p className="text-text-secondary text-center py-12 text-base">
                      No tracked transactions yet.
                    </p>
                  )}
                  {allTransactions.map((transaction) => {
                    const isSplit =
                      "isSplit" in transaction && transaction.isSplit;
                    return (
                      <div
                        key={transaction.id}
                        onClick={() => {
                          if (isSplit && "parentTransactionId" in transaction) {
                            fetchAndOpenSplitModal(
                              transaction.parentTransactionId,
                            );
                          } else if (!isSplit) {
                            openEditModal(transaction as Transaction);
                          }
                        }}
                        className="border-b border-border pb-3 last:border-0 rounded px-2 -mx-2 py-2 transition-colors cursor-pointer hover:bg-surface-secondary"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-text-secondary">
                                {transaction.date
                                  ? formatDate(transaction.date)
                                  : "—"}
                              </span>
                              {isSplit && (
                                <span className="text-xs text-accent-purple bg-accent-purple-light px-1.5 py-0.5 rounded">
                                  split
                                </span>
                              )}
                            </div>
                            <p className="text-base text-text-primary truncate mt-1">
                              {transaction.merchant || transaction.description}
                            </p>
                          </div>
                          <span className="text-base font-medium text-text-primary ml-3">
                            ${formatCurrency(Math.abs(transaction.amount))}
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
                    <p className="text-text-secondary text-center py-12 text-base">
                      No deleted transactions.
                    </p>
                  )}
                  {deletedTxns.map((txn) => (
                    <div
                      key={txn.id}
                      className="bg-surface-secondary border border-border rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-text-tertiary">
                              {formatDate(txn.date)}
                            </span>
                          </div>
                          <p className="text-base text-text-secondary truncate line-through mt-1">
                            {txn.merchant || txn.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <span className="text-base text-text-tertiary line-through">
                            ${formatCurrency(txn.amount)}
                          </span>
                          <button
                            onClick={() => handleRestoreTransaction(txn.id)}
                            className="p-1.5 text-success hover:bg-success-light rounded"
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
                setDefaultBudgetItemId('');
                setDefaultType('expense');
                setIsAddModalOpen(true);
              }}
              className="fixed bottom-10 right-14 w-16 h-16 bg-primary hover:bg-primary-hover text-white rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.25)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)] flex items-center justify-center transition-all"
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
        defaultBudgetItemId={defaultBudgetItemId}
        defaultType={defaultType}
      />

      {/* Split Transaction Modal */}
      <SplitTransactionModal
        isOpen={isSplitModalOpen}
        onClose={closeSplitModal}
        onSplit={handleSplitTransaction}
        transactionId={transactionToSplit?.id || ''}
        transactionAmount={transactionToSplit?.amount || 0}
        transactionDescription={
          transactionToSplit?.merchant || transactionToSplit?.description || ""
        }
        budgetItems={getAllBudgetItems()}
        existingSplits={existingSplits}
      />
    </div>
  );
}
