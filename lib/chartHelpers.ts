import { Budget, CategoryType } from '@/types/budget';
import { CategoryChartData, MonthlyTrendData, FlowData, FlowNode, FlowLink } from '@/types/chart';
import { getCategoryColor, getCategoryEmoji } from './chartColors';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Transform a budget into category-level chart data
 * Excludes income category for expense-focused charts
 */
export function transformBudgetToCategoryData(budget: Budget | null): CategoryChartData[] {
  if (!budget) return [];

  const categoryKeys: CategoryType[] = [
    'giving',
    'household',
    'transportation',
    'food',
    'personal',
    'insurance',
    'saving',
  ];

  return categoryKeys.map((key) => {
    const category = budget.categories[key];
    const planned = category.items.reduce((sum, item) => sum + item.planned, 0);
    const actual = category.items.reduce((sum, item) => sum + item.actual, 0);

    return {
      key,
      name: category.name,
      emoji: getCategoryEmoji(key),
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

    // Calculate actual spending for each category (excluding income)
    const categoryKeys: CategoryType[] = [
      'giving',
      'household',
      'transportation',
      'food',
      'personal',
      'insurance',
      'saving',
    ];

    categoryKeys.forEach((key) => {
      const category = budget.categories[key];
      categories[key] = category.items.reduce((sum, item) => sum + item.actual, 0);
    });

    return {
      month: MONTH_NAMES[budget.month],
      year: budget.year,
      date: new Date(budget.year, budget.month, 1),
      categories: categories as Record<CategoryType, number>,
    };
  });
}

/**
 * Transform a budget into 3-column flow diagram data (Sankey)
 * Column 1 (Sources): Buffer, Income, Non-Income
 * Column 2 (Categories): Expense categories
 * Column 3 (Items): Individual budget items with spending
 */
export function transformBudgetToFlowData(budget: Budget | null): FlowData {
  if (!budget) {
    return { nodes: [], links: [] };
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // --- Column 1: Income Sources ---

  // Buffer
  const bufferAmount = budget.buffer || 0;

  // Income items (type=income transactions in the Income category)
  const incomeItems = budget.categories.income.items.filter((item) => item.actual > 0);
  const totalIncome = incomeItems.reduce((sum, item) => sum + item.actual, 0);

  // We group income sources into up to 3 stream nodes
  if (bufferAmount > 0) {
    nodes.push({
      id: 'source-buffer',
      label: '💼 Buffer',
      color: '#6b7280', // gray
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

  // Non-income sources (gifts, refunds, etc.) — income items with type 'expense' would be unusual
  // For now, if there's no buffer and no income, return empty
  const totalSources = bufferAmount + totalIncome;
  if (totalSources === 0) {
    return { nodes: [], links: [] };
  }

  // --- Column 2: Expense Categories ---

  const expenseCategories: CategoryType[] = [
    'giving',
    'household',
    'transportation',
    'food',
    'personal',
    'insurance',
    'saving',
  ];

  const categoriesWithSpending = expenseCategories
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

  // Create category nodes (middle column)
  categoriesWithSpending.forEach(({ key, category, items }) => {
    nodes.push({
      id: `category-${key}`,
      label: `${getCategoryEmoji(key)} ${category.name}`,
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

  // Distribute each source proportionally across categories based on actual spending
  const sourceNodes = nodes.filter((n) => n.column === 'source');
  sourceNodes.forEach((sourceNode) => {
    const sourceAmount =
      sourceNode.id === 'source-buffer' ? bufferAmount : totalIncome;

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

  const allCategories: CategoryType[] = [
    'giving',
    'household',
    'transportation',
    'food',
    'personal',
    'insurance',
    'saving',
  ];

  return allCategories.some((key) => {
    const category = budget.categories[key];
    return category.items.some((item) => item.actual > 0);
  });
}

/**
 * Check if budget has both income and expenses (for flow diagram)
 */
export function hasIncomeAndExpenses(budget: Budget | null): boolean {
  if (!budget) return false;

  const hasIncome = budget.categories.income.items.some((item) => item.actual > 0);

  const expenseCategories: CategoryType[] = [
    'giving',
    'household',
    'transportation',
    'food',
    'personal',
    'insurance',
    'saving',
  ];

  const hasExpenses = expenseCategories.some((key) => {
    return budget.categories[key].items.some((item) => item.actual > 0);
  });

  return hasIncome && hasExpenses;
}
