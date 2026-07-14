"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DashboardLayout from "@/components/DashboardLayout";
import { Budget, BudgetItem, BudgetCategory } from "@/types/budget";
import { transformDbBudgetToAppBudget } from "@/lib/budgetHelpers";
import { formatCurrency } from "@/lib/formatCurrency";
import { Calendar } from "lucide-react";
import MonthNavigator from "@/components/MonthNavigator";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const categoryEmojiMap: Record<string, string> = {
  Income: "💰",
  Giving: "🤲",
  Household: "🏠",
  Transportation: "🚗",
  Food: "🍽️",
  Personal: "👤",
  Insurance: "🛡️",
  Saving: "💵",
};

function getCategoryEmoji(categoryName: string, emoji?: string | null): string {
  if (emoji) return emoji;
  return categoryEmojiMap[categoryName] || "📁";
}

interface ScheduledItem {
  item: BudgetItem;
  categoryName: string;
  categoryEmoji: string;
  categoryType: string;
  isIncome: boolean;
}

function getItemStatus(item: BudgetItem, expectedDay: number, currentDay: number, isCurrentMonth: boolean): {
  label: string;
  color: string;
  bgColor: string;
} {
  const hasTransactions = item.actual > 0;
  const isFulfilled = hasTransactions && item.actual >= item.planned && item.planned > 0;

  if (isFulfilled) {
    return { label: "Received", color: "text-success", bgColor: "bg-success-light" };
  }
  if (hasTransactions) {
    return { label: "Partial", color: "text-accent-orange", bgColor: "bg-accent-orange-light" };
  }
  if (isCurrentMonth && expectedDay < currentDay) {
    return { label: "Overdue", color: "text-danger", bgColor: "bg-danger-light" };
  }
  return { label: "Upcoming", color: "text-text-tertiary", bgColor: "bg-surface-secondary" };
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

export default function CashFlowPageWrapper() {
  return (
    <Suspense>
      <CashFlowPage />
    </Suspense>
  );
}

function CashFlowPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentDate = new Date();
  const [month, setMonth] = useState(() => {
    const p = searchParams.get("month");
    return p !== null ? parseInt(p) : currentDate.getMonth();
  });
  const [year, setYear] = useState(() => {
    const p = searchParams.get("year");
    return p !== null ? parseInt(p) : currentDate.getFullYear();
  });
  const [budget, setBudget] = useState<Budget | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBudget = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/budgets?month=${month}&year=${year}`);
      if (!res.ok) throw new Error("Failed to fetch budget");
      const data = await res.json();
      setBudget(transformDbBudgetToAppBudget(data));
    } catch {
      // Budget fetch failed
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    fetchBudget();
  }, [fetchBudget]);

  useEffect(() => {
    router.replace(`/cash-flow?month=${month}&year=${year}`, { scroll: false });
  }, [month, year, router]);

  // Build scheduled and unscheduled items from budget
  const { scheduledItems, unscheduledItems } = (() => {
    if (!budget) return { scheduledItems: [] as ScheduledItem[], unscheduledItems: [] as ScheduledItem[] };

    const scheduled: ScheduledItem[] = [];
    const unscheduled: ScheduledItem[] = [];

    Object.entries(budget.categories).forEach(([categoryType, category]) => {
      const emoji = getCategoryEmoji(category.name, category.emoji);
      const isIncome = categoryType === "income";

      category.items.forEach((item) => {
        const entry: ScheduledItem = {
          item,
          categoryName: category.name,
          categoryEmoji: emoji,
          categoryType,
          isIncome,
        };

        if (item.expectedDay) {
          scheduled.push(entry);
        } else {
          unscheduled.push(entry);
        }
      });
    });

    scheduled.sort((a, b) => (a.item.expectedDay || 0) - (b.item.expectedDay || 0));
    return { scheduledItems: scheduled, unscheduledItems: unscheduled };
  })();

  const isCurrentMonth = month === currentDate.getMonth() && year === currentDate.getFullYear();
  const today = currentDate.getDate();

  // Calculate running totals
  const runningTotals: { day: number; balance: number }[] = [];
  let runningBalance = 0;
  scheduledItems.forEach((entry) => {
    const amount = entry.isIncome ? entry.item.planned : -entry.item.planned;
    runningBalance += amount;
    runningTotals.push({ day: entry.item.expectedDay || 0, balance: runningBalance });
  });

  // Summary stats
  const totalScheduledIncome = scheduledItems
    .filter((e) => e.isIncome)
    .reduce((sum, e) => sum + e.item.planned, 0);
  const totalScheduledExpenses = scheduledItems
    .filter((e) => !e.isIncome)
    .reduce((sum, e) => sum + e.item.planned, 0);

  return (
    <DashboardLayout>
      <div className="h-full overflow-y-auto p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Calendar className="text-primary" size={24} />
            <h1 className="text-2xl font-bold text-text-primary">Cash Flow</h1>
          </div>
          <MonthNavigator
            month={month}
            year={year}
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
          />
        </div>

        {loading ? (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="grid grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-4 w-28 mb-2" />
                  <Skeleton className="h-7 w-24" />
                </Card>
              ))}
            </div>
            <Card className="overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <Skeleton className="h-6 w-28" />
              </div>
              <div className="divide-y divide-border">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="px-6 py-3 flex items-center gap-4">
                    <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <Card className="p-4">
                <p className="text-sm text-text-tertiary mb-1">Scheduled Income</p>
                <p className="text-xl font-bold text-success">+${formatCurrency(totalScheduledIncome)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-text-tertiary mb-1">Scheduled Expenses</p>
                <p className="text-xl font-bold text-danger">-${formatCurrency(totalScheduledExpenses)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-text-tertiary mb-1">Net Cash Flow</p>
                <p className={`text-xl font-bold ${runningBalance >= 0 ? "text-success" : "text-danger"}`}>
                  {runningBalance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(runningBalance))}
                </p>
              </Card>
            </div>

            {/* Scheduled Timeline */}
            {scheduledItems.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-lg font-semibold text-text-primary">Scheduled</h2>
                </div>
                <div className="divide-y divide-border">
                  {scheduledItems.map((entry, index) => {
                    const day = entry.item.expectedDay || 0;
                    const status = getItemStatus(entry.item, day, today, isCurrentMonth);
                    const showDayHeader =
                      index === 0 || day !== (scheduledItems[index - 1].item.expectedDay || 0);
                    const isToday = isCurrentMonth && day === today;

                    return (
                      <div key={entry.item.id}>
                        {showDayHeader && (
                          <div className={`px-6 py-2 ${isToday ? "bg-primary-light" : "bg-surface-secondary"}`}>
                            <span className={`text-sm font-semibold ${isToday ? "text-primary" : "text-text-secondary"}`}>
                              {MONTH_NAMES[month].slice(0, 3)} {day}{getOrdinalSuffix(day)}
                              {isToday && " — Today"}
                            </span>
                          </div>
                        )}
                        <div className="px-6 py-3 flex items-center gap-4 hover:bg-surface-secondary/50 transition-colors">
                          <span className="text-xl flex-shrink-0">{entry.categoryEmoji}</span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-text-primary truncate">{entry.item.name}</p>
                            <p className="text-sm text-text-tertiary">{entry.categoryName}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className={`font-semibold ${entry.isIncome ? "text-success" : "text-text-primary"}`}>
                              {entry.isIncome ? "+" : "-"}${formatCurrency(entry.item.planned)}
                            </p>
                            {entry.item.actual > 0 && (
                              <p className="text-xs text-text-tertiary">
                                ${formatCurrency(entry.item.actual)} actual
                              </p>
                            )}
                          </div>
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${status.color} ${status.bgColor}`}>
                            {status.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Unscheduled */}
            {unscheduledItems.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-lg font-semibold text-text-secondary">Unscheduled</h2>
                  <p className="text-sm text-text-tertiary mt-0.5">
                    Items without an expected date
                  </p>
                </div>
                <div className="divide-y divide-border">
                  {unscheduledItems.map((entry) => (
                    <div
                      key={entry.item.id}
                      className="px-6 py-3 flex items-center gap-4"
                    >
                      <span className="text-xl flex-shrink-0">{entry.categoryEmoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-text-primary truncate">{entry.item.name}</p>
                        <p className="text-sm text-text-tertiary">{entry.categoryName}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`font-semibold ${entry.isIncome ? "text-success" : "text-text-primary"}`}>
                          {entry.isIncome ? "+" : "-"}${formatCurrency(entry.item.planned)}
                        </p>
                        {entry.item.actual > 0 && (
                          <p className="text-xs text-text-tertiary">
                            ${formatCurrency(entry.item.actual)} actual
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Empty State */}
            {scheduledItems.length === 0 && unscheduledItems.length === 0 && (
              <Card className="p-12 text-center">
                <Calendar className="mx-auto text-text-tertiary mb-4" size={32} />
                <h3 className="text-lg font-semibold text-text-primary mb-2">No budget items yet</h3>
                <p className="text-text-secondary">
                  Add items to your budget and set expected dates to see your cash flow timeline.
                </p>
              </Card>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
