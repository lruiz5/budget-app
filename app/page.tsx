"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import BudgetHeader from "@/components/BudgetHeader";
import BufferSection from "@/components/BufferSection";
import BudgetSection from "@/components/BudgetSection";
import BudgetSummary from "@/components/BudgetSummary";
import AddTransactionModal, { TransactionToEdit } from "@/components/AddTransactionModal";
import MonthlyReportModal from "@/components/MonthlyReportModal";
import DashboardLayout from "@/components/DashboardLayout";
import { Budget, Transaction, BudgetItem, DEFAULT_CATEGORIES } from "@/types/budget";
import { transformDbBudgetToAppBudget } from "@/lib/budgetHelpers";
import { FaColumns, FaTimes, FaSearch } from "react-icons/fa";

const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  { label: 'Finance', emojis: ['💰', '💵', '💳', '🏦', '💎', '🪙', '📈', '📉', '💸', '🧾', '🏧'] },
  { label: 'Home', emojis: ['🏠', '🏡', '🛋️', '🛏️', '🧹', '🔑', '🪴', '🕯️', '🧺', '🪣', '🧽'] },
  { label: 'Transport', emojis: ['🚗', '🚕', '🚌', '🚲', '✈️', '⛽', '🚇', '🛵', '🚁', '⛵', '🛻'] },
  { label: 'Food & Drink', emojis: ['🍽️', '🍕', '🍔', '🥗', '☕', '🍷', '🛒', '🧁', '🍣', '🥡', '🍺'] },
  { label: 'Health', emojis: ['🏥', '💊', '🩺', '🏋️', '🧘', '🧠', '❤️', '🦷', '👁️', '🩹', '💉'] },
  { label: 'Education', emojis: ['📚', '🎓', '✏️', '📝', '🔬', '💻', '📐', '🎒', '📖', '🧪', '🏫'] },
  { label: 'Kids & Pets', emojis: ['👶', '🧸', '🐾', '🐶', '🐱', '🎠', '🍼', '🧩', '🪁', '🐠', '🐴'] },
  { label: 'Fun & Hobbies', emojis: ['🎮', '🎵', '🎨', '🎸', '⚽', '🎯', '🎲', '📱', '🎬', '📸', '🎤'] },
  { label: 'Giving', emojis: ['🤲', '🎁', '💝', '🙏', '⛪', '🕊️', '🌍', '🎗️', '🤝', '❤️‍🔥', '🫶'] },
  { label: 'Travel', emojis: ['🏖️', '🗺️', '🧳', '🏔️', '🌴', '🗼', '🎢', '🏕️', '🌅', '🚀', '🛳️'] },
  { label: 'Work', emojis: ['💼', '🛠️', '📋', '📊', '🖥️', '📧', '🏢', '📎', '🗂️', '💡', '⚙️'] },
  { label: 'Nature', emojis: ['🌱', '🌻', '🌳', '🍂', '🌊', '☀️', '🌙', '⭐', '🔥', '❄️', '🌈'] },
];

interface LinkedAccount {
  id: string;
  accountName: string;
  institutionName: string;
  lastFour: string;
  accountSubtype: string;
}

interface SelectedBudgetItem {
  item: BudgetItem;
  categoryName: string;
  categoryType?: string;
}

export default function HomeWrapper() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentDate = new Date();
  const [month, setMonth] = useState(() => {
    const p = searchParams.get('month');
    return p !== null ? parseInt(p) : currentDate.getMonth();
  });
  const [year, setYear] = useState(() => {
    const p = searchParams.get('year');
    return p !== null ? parseInt(p) : currentDate.getFullYear();
  });
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
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupEmoji, setNewGroupEmoji] = useState('📋');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [isResetBudgetOpen, setIsResetBudgetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetMode, setResetMode] = useState<'zero' | 'replace' | null>(null);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);

  // Copy from month state - default to previous month
  const defaultSourceMonth = month === 0 ? 11 : month - 1;
  const defaultSourceYear = month === 0 ? year - 1 : year;
  const [copySourceMonth, setCopySourceMonth] = useState(defaultSourceMonth);
  const [copySourceYear, setCopySourceYear] = useState(defaultSourceYear);

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
    router.push(`/?month=${newMonth}&year=${newYear}`, { scroll: false });
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
  const handleItemClick = (item: BudgetItem, categoryName: string, categoryType?: string) => {
    setSelectedBudgetItem({ item, categoryName, categoryType });
  };

  // Handle clicking on a transaction to edit it
  const handleTransactionClick = (transaction: Transaction) => {
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
    setIsEditModalOpen(true);
  };

  const handleEditTransaction = async (transaction: {
    id: string;
    budgetItemId: string;
    linkedAccountId?: string;
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

  const handleDeleteFromModal = async (id: string) => {
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

  const handleAddGroup = async () => {
    if (!newGroupName.trim() || !budget?.id) return;
    try {
      const response = await fetch('/api/budget-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budgetId: budget.id,
          name: newGroupName.trim(),
          emoji: newGroupEmoji,
        }),
      });
      if (response.ok) {
        setIsAddGroupOpen(false);
        setNewGroupName('');
        setNewGroupEmoji('📋');
        refreshBudget();
      } else {
        const err = await response.json();
        alert(err.error || 'Failed to create category');
      }
    } catch (error) {
      console.error('Error creating category:', error);
    }
  };

  const handleDeleteCategory = async (dbId: string) => {
    if (!confirm('Delete this category? All its items and transactions will be removed.')) return;
    try {
      const response = await fetch(`/api/budget-categories?id=${dbId}`, { method: 'DELETE' });
      if (response.ok) {
        refreshBudget();
      }
    } catch (error) {
      console.error('Error deleting category:', error);
    }
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

  // Handle copying from selected source month
  const handleCopyFromMonth = async (srcMonth?: number, srcYear?: number) => {
    const sourceMonth = srcMonth ?? copySourceMonth;
    const sourceYear = srcYear ?? copySourceYear;

    try {
      const response = await fetch('/api/budgets/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceMonth,
          sourceYear,
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
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header - fixed at top */}
            <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-8 bg-surface">
              <BudgetHeader
                month={budget.month}
                year={budget.year}
                remainingToBudget={0}
                onMonthChange={handleMonthChange}
              />
            </div>

            {/* Empty state content - scrollable */}
            <div className="flex-1 overflow-y-auto hide-scrollbar">
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

                {/* Subtext with month selector */}
                <p className="text-text-secondary mb-4">
                  Copy an existing budget to get started:
                </p>

                {/* Month/Year selector */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  <select
                    value={copySourceMonth}
                    onChange={(e) => setCopySourceMonth(parseInt(e.target.value))}
                    className="px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'].map((name, idx) => (
                      <option key={idx} value={idx}>{name}</option>
                    ))}
                  </select>
                  <select
                    value={copySourceYear}
                    onChange={(e) => setCopySourceYear(parseInt(e.target.value))}
                    className="px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {[year - 1, year, year + 1].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleCopyFromMonth()}
                  className="px-8 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary-hover transition-colors"
                >
                  Copy from {getMonthName(copySourceMonth)} {copySourceYear}
                </button>
              </div>
            </div>
          </div>

          {/* Right sidebar placeholder */}
          <div className="hidden lg:block w-xl bg-surface-secondary p-8"></div>
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
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header - fixed at top */}
          <div className="flex-shrink-0 px-4 sm:px-6 lg:px-8 pt-8 bg-surface">
            <BudgetHeader
              month={budget.month}
              year={budget.year}
              remainingToBudget={remainingToBudget}
              onMonthChange={handleMonthChange}
            />
          </div>

          {/* Budget content - scrollable */}
          <div className="flex-1 overflow-y-auto hide-scrollbar">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="space-y-6 pb-8">
              <BufferSection
                budgetId={budget.id}
                buffer={budget.buffer}
                onRefresh={refreshBudget}
              />

              {/* Render categories dynamically: income first, then defaults, then custom, saving last */}
              {(() => {
                const entries = Object.entries(budget.categories);
                const income = entries.find(([key]) => key === 'income');
                const saving = entries.find(([key]) => key === 'saving');
                const defaults = entries.filter(([key]) => key !== 'income' && key !== 'saving' && DEFAULT_CATEGORIES.includes(key as any));
                const custom = entries.filter(([key]) => !DEFAULT_CATEGORIES.includes(key as any));
                const ordered = [
                  ...(income ? [income] : []),
                  ...defaults,
                  ...custom,
                  ...(saving ? [saving] : []),
                ];
                return ordered.map(([key, category]) => (
                  <div key={key} className="relative group">
                    <BudgetSection
                      category={category}
                      categoryType={key}
                      onRefresh={refreshBudget}
                      onTransactionClick={handleTransactionClick}
                      onSplitClick={handleSplitClick}
                      onItemClick={handleItemClick}
                      selectedItemId={selectedBudgetItem?.item.id}
                    />
                    {/* Delete button for custom categories */}
                    {!DEFAULT_CATEGORIES.includes(key as any) && category.dbId && (
                      <button
                        onClick={() => handleDeleteCategory(category.dbId!)}
                        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 text-danger hover:bg-danger-light rounded transition-opacity"
                        title="Delete category"
                      >
                        <FaTimes size={12} />
                      </button>
                    )}
                  </div>
                ));
              })()}

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsAddGroupOpen(true)}
                  className="flex-1 py-3 border-2 border-dotted border-border-strong rounded-lg text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer"
                >
                  + Add Group
                </button>
                <button
                  onClick={() => setIsCopyModalOpen(true)}
                  className="flex-1 py-3 border-2 border-dotted border-border-strong rounded-lg text-text-secondary hover:border-primary hover:text-primary transition-colors cursor-pointer"
                >
                  📋 Copy from Month
                </button>
              </div>

              {/* Reset Budget Button */}
              <button
                onClick={() => setIsResetBudgetOpen(true)}
                className="w-full py-3 border-2 border-dotted border-danger/40 rounded-lg text-danger/60 hover:border-danger hover:text-danger transition-colors cursor-pointer"
              >
                Reset Budget
              </button>

              {/* Reset Budget Modal */}
              {isResetBudgetOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-text-primary">How would you like to reset your budget?</h3>
                      <button
                        onClick={() => { setIsResetBudgetOpen(false); setResetMode(null); }}
                        className="text-text-tertiary hover:text-text-secondary p-1"
                      >
                        <FaTimes size={16} />
                      </button>
                    </div>

                    {!resetMode ? (
                      <div className="space-y-3">
                        <button
                          onClick={() => setResetMode('zero')}
                          className="w-full p-4 border border-border-strong rounded-lg hover:bg-surface-secondary transition-colors text-left"
                        >
                          <div className="font-medium text-text-primary">Zero out all planned amounts</div>
                          <div className="text-sm text-text-secondary mt-1">Keep your categories and items, but set all planned amounts to $0.00</div>
                        </button>

                        <button
                          onClick={() => setResetMode('replace')}
                          className="w-full p-4 border border-border-strong rounded-lg hover:bg-surface-secondary transition-colors text-left"
                        >
                          <div className="font-medium text-text-primary">Replace with last month&apos;s budget</div>
                          <div className="text-sm text-text-secondary mt-1">Delete current items and copy everything from {getPreviousMonthName(budget.month)}</div>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-text-secondary">
                          {resetMode === 'zero'
                            ? 'This will set all planned amounts to $0.00. Your categories, items, and transactions will be kept.'
                            : `This will delete all current items and replace them with ${getPreviousMonthName(budget.month)}'s budget. Transactions will be kept.`}
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setResetMode(null)}
                            disabled={isResetting}
                            className="flex-1 py-2 border border-border-strong rounded-lg text-text-secondary hover:bg-surface-secondary transition-colors"
                          >
                            Back
                          </button>
                          <button
                            disabled={isResetting}
                            onClick={async () => {
                              setIsResetting(true);
                              try {
                                const res = await fetch('/api/budgets/reset', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ budgetId: budget.id, mode: resetMode }),
                                });
                                if (res.ok) { refreshBudget(); setIsResetBudgetOpen(false); setResetMode(null); }
                              } catch (e) { console.error('Reset error:', e); }
                              setIsResetting(false);
                            }}
                            className="flex-1 py-2 bg-danger text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                          >
                            {isResetting ? 'Resetting...' : 'Confirm Reset'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Add Group Modal */}
              {isAddGroupOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-surface rounded-xl shadow-2xl w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-text-primary">New Category</h3>
                      <button
                        onClick={() => { setIsAddGroupOpen(false); setNewGroupName(''); setNewGroupEmoji('📋'); }}
                        className="text-text-tertiary hover:text-text-secondary p-1"
                      >
                        <FaTimes size={16} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-1">Name</label>
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="e.g. Pet Care"
                          className="w-full border border-border-strong rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddGroup(); }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-text-secondary mb-2">Emoji</label>
                        <div className="relative mb-2">
                          <FaSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" size={12} />
                          <input
                            type="text"
                            value={emojiSearch}
                            onChange={(e) => setEmojiSearch(e.target.value)}
                            placeholder="Search (e.g. home, food)"
                            className="w-full border border-border rounded-lg pl-7 pr-3 py-1.5 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {EMOJI_GROUPS
                            .filter((g) => !emojiSearch || g.label.toLowerCase().includes(emojiSearch.toLowerCase()))
                            .map((group) => (
                              <div key={group.label}>
                                <div className="text-xs text-text-tertiary mb-1">{group.label}</div>
                                <div className="flex flex-wrap gap-0.5">
                                  {group.emojis.map((emoji) => (
                                    <button
                                      key={emoji}
                                      onClick={() => setNewGroupEmoji(emoji)}
                                      className={`w-7 h-7 flex items-center justify-center rounded text-base hover:bg-surface-secondary transition-colors ${
                                        newGroupEmoji === emoji ? 'bg-primary-light ring-2 ring-primary' : ''
                                      }`}
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      <button
                        onClick={handleAddGroup}
                        disabled={!newGroupName.trim()}
                        className="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
                      >
                        Create Category
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Copy from Month Modal */}
              {isCopyModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-surface rounded-xl shadow-2xl w-full max-w-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-text-primary">Copy from Another Month</h3>
                      <button
                        onClick={() => setIsCopyModalOpen(false)}
                        className="text-text-tertiary hover:text-text-secondary p-1"
                      >
                        <FaTimes size={16} />
                      </button>
                    </div>

                    <p className="text-sm text-text-secondary mb-4">
                      This will copy all categories and budget items (with planned amounts) from the selected month.
                    </p>

                    <div className="flex gap-2 mb-6">
                      <select
                        value={copySourceMonth}
                        onChange={(e) => setCopySourceMonth(parseInt(e.target.value))}
                        className="flex-1 px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'].map((name, idx) => (
                          <option key={idx} value={idx}>{name}</option>
                        ))}
                      </select>
                      <select
                        value={copySourceYear}
                        onChange={(e) => setCopySourceYear(parseInt(e.target.value))}
                        className="px-3 py-2 border border-border rounded-lg bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        {[year - 1, year, year + 1].map((y) => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setIsCopyModalOpen(false)}
                        className="flex-1 py-2 border border-border rounded-lg text-text-secondary hover:bg-surface-secondary transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          handleCopyFromMonth();
                          setIsCopyModalOpen(false);
                        }}
                        className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                      >
                        Copy Budget
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

        {/* Toggle button for summary sidebar on tablet */}
        <button
          onClick={() => setIsSummaryOpen(!isSummaryOpen)}
          className="lg:hidden fixed bottom-6 right-6 z-40 w-12 h-12 bg-primary text-white rounded-full shadow-lg flex items-center justify-center hover:bg-primary-hover transition-colors"
        >
          <FaColumns size={18} />
        </button>

        {/* Summary sidebar overlay on tablet */}
        {isSummaryOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/30 z-40"
            onClick={() => setIsSummaryOpen(false)}
          />
        )}

        {/* Right sidebar for summary */}
        <div className={`
          ${isSummaryOpen ? 'fixed inset-y-0 right-0 z-50 w-96' : 'hidden'}
          lg:relative lg:block lg:w-xl lg:z-auto
          bg-surface-secondary p-8 overflow-y-auto hide-scrollbar transition-all
        `}>
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
