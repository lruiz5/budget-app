import { Budget } from '@/types/budget';
import { CategoryChartData, MonthlyTrendData, FlowData, FlowNode, FlowLink } from '@/types/chart';
import { getCategoryColor, getCategoryEmoji } from './chartColors';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Get expense category keys (everything except income) from a budget */
function getExpenseCategoryKeys(budget: Budget): string[] {
  return Object.keys(budget.categories).filter(key => key !== 'income');
}

/**
 * Transform a budget into category-level chart data
 * Excludes income category for expense-focused charts
 */
/** Calculate tag reclassification adjustments for reporting */
function getTagAdjustments(budget: Budget): Record<string, number> {
  const adjustments: Record<string, number> = {};
  Object.entries(budget.categories).forEach(([catKey, category]) => {
    category.items.forEach((item) => {
      item.transactions.forEach((t) => {
        if (t.tagCategoryType && t.tagCategoryType !== catKey) {
          const amt = t.type === 'expense' ? t.amount : -t.amount;
          adjustments[catKey] = (adjustments[catKey] || 0) - amt;
          adjustments[t.tagCategoryType] = (adjustments[t.tagCategoryType] || 0) + amt;
        }
      });
    });
  });
  return adjustments;
}

export function transformBudgetToCategoryData(budget: Budget | null): CategoryChartData[] {
  if (!budget) return [];

  const tagAdj = getTagAdjustments(budget);

  return getExpenseCategoryKeys(budget).map((key) => {
    const category = budget.categories[key];
    const planned = category.items.reduce((sum, item) => sum + item.planned, 0);
    const baseActual = category.items.reduce((sum, item) => sum + item.actual, 0);
    const actual = baseActual + (tagAdj[key] || 0);

    return {
      key,
      name: category.name,
      emoji: getCategoryEmoji(key, category.emoji),
      planned,
      actual,
      color: getCategoryColor(key),
    };
  });
}

/**
 * Transform multiple budgets into time-series trend data
 * Returns monthly data points with spending per category
 */
export function transformBudgetsToTrendData(budgets: Budget[]): MonthlyTrendData[] {
  if (!budgets || budgets.length === 0) return [];

  return budgets.map((budget) => {
    const categories: Record<string, number> = {};
    const tagAdj = getTagAdjustments(budget);

    getExpenseCategoryKeys(budget).forEach((key) => {
      const category = budget.categories[key];
      const baseActual = category.items.reduce((sum, item) => sum + item.actual, 0);
      categories[key] = baseActual + (tagAdj[key] || 0);
    });

    return {
      month: MONTH_NAMES[budget.month],
      year: budget.year,
      date: new Date(budget.year, budget.month, 1),
      categories,
    };
  });
}

/**
 * Transform a budget into 3-column flow diagram data (Sankey)
 */
export function transformBudgetToFlowData(budget: Budget | null): FlowData {
  if (!budget) {
    return { nodes: [], links: [] };
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // --- Column 1: Income Sources ---
  const bufferAmount = budget.buffer || 0;
  const incomeCategory = budget.categories.income;
  const incomeItems = incomeCategory ? incomeCategory.items.filter((item) => item.actual > 0) : [];
  const totalIncome = incomeItems.reduce((sum, item) => sum + item.actual, 0);

  if (bufferAmount > 0) {
    nodes.push({
      id: 'source-buffer',
      label: '💼 Buffer',
      color: '#6b7280',
      column: 'source',
      lineItems: [{ name: 'Carried over', amount: bufferAmount }],
    });
  }

  if (totalIncome > 0) {
    nodes.push({
      id: 'source-income',
      label: '💰 Income',
      color: getCategoryColor('income'),
      column: 'source',
      lineItems: incomeItems.map((item) => ({ name: item.name, amount: item.actual })),
    });
  }

  const totalSources = bufferAmount + totalIncome;
  if (totalSources === 0) {
    return { nodes: [], links: [] };
  }

  // --- Column 2: Expense Categories ---
  const expenseKeys = getExpenseCategoryKeys(budget);

  const categoriesWithSpending = expenseKeys
    .map((key) => ({
      key,
      category: budget.categories[key],
      total: budget.categories[key].items.reduce((sum, item) => sum + item.actual, 0),
      items: budget.categories[key].items.filter((item) => item.actual > 0),
    }))
    .filter((c) => c.total > 0);

  if (categoriesWithSpending.length === 0) {
    return { nodes: [], links: [] };
  }

  categoriesWithSpending.forEach(({ key, category, items }) => {
    nodes.push({
      id: `category-${key}`,
      label: `${getCategoryEmoji(key, category.emoji)} ${category.name}`,
      color: getCategoryColor(key),
      column: 'category',
      lineItems: items.map((item) => ({ name: item.name, amount: item.actual })),
    });
  });

  // --- Column 3: Budget Items ---
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach((item) => {
      nodes.push({
        id: `item-${item.id}`,
        label: item.name,
        color: getCategoryColor(key),
        column: 'item',
      });
    });
  });

  // --- Links: Sources → Categories ---
  const totalExpenses = categoriesWithSpending.reduce((sum, c) => sum + c.total, 0);
  const sourceNodes = nodes.filter((n) => n.column === 'source');

  sourceNodes.forEach((sourceNode) => {
    const sourceAmount = sourceNode.id === 'source-buffer' ? bufferAmount : totalIncome;

    categoriesWithSpending.forEach(({ key, total }) => {
      const proportion = total / totalExpenses;
      const flowAmount = Math.min(sourceAmount * proportion, total);

      if (flowAmount > 0.01) {
        links.push({
          source: sourceNode.id,
          target: `category-${key}`,
          value: flowAmount,
          color: getCategoryColor(key),
        });
      }
    });
  });

  // --- Links: Categories → Items ---
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach((item) => {
      links.push({
        source: `category-${key}`,
        target: `item-${item.id}`,
        value: item.actual,
        color: getCategoryColor(key),
      });
    });
  });

  return { nodes, links };
}

/**
 * Check if budget has sufficient transaction data
 */
export function hasTransactionData(budget: Budget | null): boolean {
  if (!budget) return false;
  return getExpenseCategoryKeys(budget).some((key) => {
    return budget.categories[key].items.some((item) => item.actual > 0);
  });
}

/**
 * Check if budget has both income and expenses (for flow diagram)
 */
export function hasIncomeAndExpenses(budget: Budget | null): boolean {
  if (!budget) return false;
  const incomeCategory = budget.categories.income;
  const hasIncome = incomeCategory ? incomeCategory.items.some((item) => item.actual > 0) : false;
  const hasExpenses = getExpenseCategoryKeys(budget).some((key) => {
    return budget.categories[key].items.some((item) => item.actual > 0);
  });
  return hasIncome && hasExpenses;
}
