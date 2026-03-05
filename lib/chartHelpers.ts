import { Budget } from '@/types/budget';
import { CategoryChartData, MonthlyTrendData, FlowData, FlowNode, FlowLink } from '@/types/chart';
import { getCategoryColor, getCategoryEmoji } from './chartColors';
import { IncomeAllocation } from './api-client';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Get expense category keys (everything except income) from a budget */
function getExpenseCategoryKeys(budget: Budget): string[] {
  return Object.keys(budget.categories).filter(key => key !== 'income');
}

/**
 * Transform a budget into category-level chart data
 * Excludes income category for expense-focused charts
 */
export function transformBudgetToCategoryData(budget: Budget | null): CategoryChartData[] {
  if (!budget) return [];

  return getExpenseCategoryKeys(budget).map((key) => {
    const category = budget.categories[key];
    const planned = category.items.reduce((sum, item) => sum + item.planned, 0);
    const actual = category.items.reduce((sum, item) => sum + item.actual, 0);

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

    getExpenseCategoryKeys(budget).forEach((key) => {
      const category = budget.categories[key];
      categories[key] = category.items.reduce((sum, item) => sum + item.actual, 0);
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
 * Transform multiple budgets into discretionary-only trend data
 * Excludes budget items linked to recurring payments
 */
export function transformBudgetsToDiscretionaryTrendData(budgets: Budget[]): MonthlyTrendData[] {
  if (!budgets || budgets.length === 0) return [];

  return budgets.map((budget) => {
    const categories: Record<string, number> = {};

    getExpenseCategoryKeys(budget).forEach((key) => {
      const category = budget.categories[key];
      categories[key] = category.items
        .filter((item) => !item.recurringPaymentId)
        .reduce((sum, item) => sum + item.actual, 0);
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
 * When allocations are provided, linked income flows directly to its target category.
 * Surplus from linked income joins the general pool; deficit is filled from it.
 */
export function transformBudgetToFlowData(budget: Budget | null, allocations: IncomeAllocation[] = []): FlowData {
  if (!budget) {
    return { nodes: [], links: [] };
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // --- Gather income items and buffer ---
  const bufferAmount = budget.buffer || 0;
  const incomeCategory = budget.categories.income;
  const incomeItems = incomeCategory ? incomeCategory.items.filter((item) => item.actual > 0) : [];

  // --- Build allocation map: incomeItemName → targetCategoryType ---
  const allocationMap = new Map<string, string>();
  allocations.forEach(a => allocationMap.set(a.incomeItemName, a.targetCategoryType));

  // --- Separate linked vs unlinked income ---
  const linkedIncome: { name: string; actual: number; targetCategory: string }[] = [];
  const unlinkedIncome: { name: string; actual: number }[] = [];

  incomeItems.forEach(item => {
    const target = allocationMap.get(item.name);
    if (target) {
      linkedIncome.push({ name: item.name, actual: item.actual, targetCategory: target });
    } else {
      unlinkedIncome.push({ name: item.name, actual: item.actual });
    }
  });

  const totalUnlinkedIncome = unlinkedIncome.reduce((sum, item) => sum + item.actual, 0);

  // --- Column 2: Expense Categories (build early so we know spending) ---
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

  // --- Calculate linked income direct flows and surpluses ---
  // Track how much of each category's spending is already covered by linked income
  const categoryLinkedCoverage = new Map<string, number>();
  let totalSurplus = 0;

  linkedIncome.forEach(({ name, actual, targetCategory }) => {
    const catData = categoriesWithSpending.find(c => c.key === targetCategory);
    const catSpending = catData ? catData.total : 0;
    const directFlow = Math.min(actual, catSpending);
    const surplus = Math.max(0, actual - catSpending);

    if (directFlow > 0) {
      categoryLinkedCoverage.set(
        targetCategory,
        (categoryLinkedCoverage.get(targetCategory) || 0) + directFlow
      );
    }

    totalSurplus += surplus;
  });

  // --- General pool = buffer + unlinked income + linked surpluses ---
  const generalPool = bufferAmount + totalUnlinkedIncome + totalSurplus;
  const totalSources = bufferAmount + incomeItems.reduce((sum, item) => sum + item.actual, 0);
  if (totalSources === 0) {
    return { nodes: [], links: [] };
  }

  // --- Column 1: Source Nodes ---
  // One node per linked income item
  linkedIncome.forEach(({ name, actual, targetCategory }) => {
    const catData = categoriesWithSpending.find(c => c.key === targetCategory);
    const catSpending = catData ? catData.total : 0;
    const directFlow = Math.min(actual, catSpending);
    const surplus = Math.max(0, actual - catSpending);

    // Only create node if this income has actual spending
    if (directFlow > 0 || surplus > 0) {
      nodes.push({
        id: `source-linked-${name.toLowerCase().replace(/\s+/g, '-')}`,
        label: `💰 ${name}`,
        color: getCategoryColor('income'),
        column: 'source',
        lineItems: [
          { name: `Direct → ${catData?.category.name || targetCategory}`, amount: directFlow },
          ...(surplus > 0.01 ? [{ name: 'Surplus → General Pool', amount: surplus }] : []),
        ],
      });
    }
  });

  // Buffer node
  if (bufferAmount > 0) {
    nodes.push({
      id: 'source-buffer',
      label: '💼 Buffer',
      color: '#6b7280',
      column: 'source',
      lineItems: [{ name: 'Carried over', amount: bufferAmount }],
    });
  }

  // Unlinked income + surplus pool (combined as "Other Income" if any exists)
  if (totalUnlinkedIncome > 0.01) {
    nodes.push({
      id: 'source-income',
      label: unlinkedIncome.length === incomeItems.length ? '💰 Income' : '💰 Other Income',
      color: getCategoryColor('income'),
      column: 'source',
      lineItems: unlinkedIncome.map((item) => ({ name: item.name, amount: item.actual })),
    });
  }

  // --- Category Nodes (Column 2) ---
  categoriesWithSpending.forEach(({ key, category, items }) => {
    nodes.push({
      id: `category-${key}`,
      label: `${getCategoryEmoji(key, category.emoji)} ${category.name}`,
      color: getCategoryColor(key),
      column: 'category',
      lineItems: items.map((item) => ({ name: item.name, amount: item.actual })),
    });
  });

  // --- Budget Item Nodes (Column 3) ---
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

  // --- Links: Linked Income → Target Categories (direct) ---
  linkedIncome.forEach(({ name, actual, targetCategory }) => {
    const catData = categoriesWithSpending.find(c => c.key === targetCategory);
    if (!catData) return;
    const directFlow = Math.min(actual, catData.total);
    if (directFlow > 0.01) {
      links.push({
        source: `source-linked-${name.toLowerCase().replace(/\s+/g, '-')}`,
        target: `category-${targetCategory}`,
        value: directFlow,
        color: getCategoryColor(targetCategory),
      });
    }
  });

  // --- Links: General pool sources → Remaining category needs ---
  // Categories that still need funding (not fully covered by linked income)
  const remainingNeeds = categoriesWithSpending
    .map(c => ({
      ...c,
      remaining: c.total - (categoryLinkedCoverage.get(c.key) || 0),
    }))
    .filter(c => c.remaining > 0.01);

  const totalRemainingNeeds = remainingNeeds.reduce((sum, c) => sum + c.remaining, 0);

  if (totalRemainingNeeds > 0.01 && generalPool > 0.01) {
    // Distribute general pool (buffer + unlinked income + surpluses) proportionally
    const generalPoolSources: { id: string; amount: number }[] = [];

    if (bufferAmount > 0.01) {
      generalPoolSources.push({ id: 'source-buffer', amount: bufferAmount });
    }
    if (totalUnlinkedIncome > 0.01) {
      generalPoolSources.push({ id: 'source-income', amount: totalUnlinkedIncome });
    }
    // Surpluses from linked income also flow to general pool categories
    linkedIncome.forEach(({ name, actual, targetCategory }) => {
      const catData = categoriesWithSpending.find(c => c.key === targetCategory);
      const catSpending = catData ? catData.total : 0;
      const surplus = Math.max(0, actual - catSpending);
      if (surplus > 0.01) {
        generalPoolSources.push({
          id: `source-linked-${name.toLowerCase().replace(/\s+/g, '-')}`,
          amount: surplus,
        });
      }
    });

    generalPoolSources.forEach(({ id: sourceId, amount: sourceAmount }) => {
      remainingNeeds.forEach(({ key, remaining }) => {
        const proportion = remaining / totalRemainingNeeds;
        const flowAmount = Math.min(sourceAmount * proportion, remaining);

        if (flowAmount > 0.01) {
          links.push({
            source: sourceId,
            target: `category-${key}`,
            value: flowAmount,
            color: getCategoryColor(key),
          });
        }
      });
    });
  }

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
 * Transform a budget into discretionary-only flow diagram data (Sankey)
 * Excludes budget items linked to recurring payments (bills)
 * Source amounts are reduced by recurring spending to show only discretionary pool
 */
export function transformBudgetToDiscretionaryFlowData(budget: Budget | null, allocations: IncomeAllocation[] = []): FlowData {
  if (!budget) {
    return { nodes: [], links: [] };
  }

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  // Calculate total recurring spending to subtract from sources
  const expenseKeys = getExpenseCategoryKeys(budget);
  let totalRecurringSpending = 0;
  expenseKeys.forEach((key) => {
    budget.categories[key].items.forEach((item) => {
      if (item.recurringPaymentId && item.actual > 0) {
        totalRecurringSpending += item.actual;
      }
    });
  });

  // --- Column 1: Sources (net of recurring bills) ---
  const bufferAmount = budget.buffer || 0;
  const incomeCategory = budget.categories.income;
  const incomeItems = incomeCategory ? incomeCategory.items.filter((item) => item.actual > 0) : [];
  const totalIncome = incomeItems.reduce((sum, item) => sum + item.actual, 0);
  const totalSources = bufferAmount + totalIncome;

  if (totalSources === 0) {
    return { nodes: [], links: [] };
  }

  // Subtract recurring spending proportionally from sources
  const discretionaryPool = Math.max(0, totalSources - totalRecurringSpending);
  if (discretionaryPool === 0) {
    return { nodes: [], links: [] };
  }

  const recurringRatio = discretionaryPool / totalSources;
  const discretionaryBuffer = bufferAmount * recurringRatio;
  const discretionaryIncome = totalIncome * recurringRatio;

  if (discretionaryBuffer > 0.01) {
    nodes.push({
      id: 'source-buffer',
      label: '💼 Buffer',
      color: '#6b7280',
      column: 'source',
      lineItems: [{ name: 'After recurring bills', amount: discretionaryBuffer }],
    });
  }

  if (discretionaryIncome > 0.01) {
    nodes.push({
      id: 'source-income',
      label: '💰 Income',
      color: getCategoryColor('income'),
      column: 'source',
      lineItems: [{ name: 'After recurring bills', amount: discretionaryIncome }],
    });
  }

  // --- Column 2: Expense Categories (discretionary items only) ---
  const categoriesWithSpending = expenseKeys
    .map((key) => {
      const discretionaryItems = budget.categories[key].items.filter(
        (item) => !item.recurringPaymentId && item.actual > 0
      );
      return {
        key,
        category: budget.categories[key],
        total: discretionaryItems.reduce((sum, item) => sum + item.actual, 0),
        items: discretionaryItems,
      };
    })
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
  const totalDiscretionaryExpenses = categoriesWithSpending.reduce((sum, c) => sum + c.total, 0);
  const sourceNodes = nodes.filter((n) => n.column === 'source');

  sourceNodes.forEach((sourceNode) => {
    const sourceAmount = sourceNode.id === 'source-buffer' ? discretionaryBuffer : discretionaryIncome;

    categoriesWithSpending.forEach(({ key, total }) => {
      const proportion = total / totalDiscretionaryExpenses;
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
 * Account info for payment method flow diagram
 */
export interface PaymentMethodAccount {
  id: string;
  accountName: string;
  accountType: string; // 'depository' | 'credit' | 'csv'
  lastFour: string;
}

/**
 * Transform a budget into 4-column flow diagram with payment methods (Sankey)
 * Sources → Payment Methods → Categories → Items
 */
export function transformBudgetToPaymentMethodFlowData(
  budget: Budget | null,
  accounts: PaymentMethodAccount[] = [],
): FlowData {
  if (!budget) return { nodes: [], links: [] };

  const nodes: FlowNode[] = [];
  const links: FlowLink[] = [];

  const accountMap = new Map(accounts.map(a => [a.id, a]));

  const bufferAmount = budget.buffer || 0;
  const incomeCategory = budget.categories.income;
  const incomeItems = incomeCategory ? incomeCategory.items.filter(i => i.actual > 0) : [];
  const totalIncome = incomeItems.reduce((sum, i) => sum + i.actual, 0);
  const totalSources = bufferAmount + totalIncome;

  if (totalSources === 0) return { nodes: [], links: [] };

  const expenseKeys = getExpenseCategoryKeys(budget);
  const categoriesWithSpending = expenseKeys
    .map(key => ({
      key,
      category: budget.categories[key],
      total: budget.categories[key].items.reduce((sum, item) => sum + item.actual, 0),
      items: budget.categories[key].items.filter(item => item.actual > 0),
    }))
    .filter(c => c.total > 0);

  if (categoriesWithSpending.length === 0) return { nodes: [], links: [] };

  // Aggregate spending by account → category
  const methodCategorySpending: Record<string, Record<string, number>> = {};
  const unlinkedSpending: Record<string, number> = {};

  categoriesWithSpending.forEach(({ key, category }) => {
    category.items.forEach(item => {
      item.transactions.forEach(txn => {
        if (txn.isTransfer) return;
        const amount = txn.type === 'expense' ? txn.amount : 0;
        if (amount <= 0) return;

        if (txn.linkedAccountId && accountMap.has(txn.linkedAccountId)) {
          if (!methodCategorySpending[txn.linkedAccountId]) {
            methodCategorySpending[txn.linkedAccountId] = {};
          }
          methodCategorySpending[txn.linkedAccountId][key] =
            (methodCategorySpending[txn.linkedAccountId][key] || 0) + amount;
        } else {
          unlinkedSpending[key] = (unlinkedSpending[key] || 0) + amount;
        }
      });
    });
  });

  // Column 1: Sources
  if (bufferAmount > 0) {
    nodes.push({
      id: 'source-buffer', label: '💼 Buffer', color: '#6b7280', column: 'source',
      lineItems: [{ name: 'Carried over', amount: bufferAmount }],
    });
  }
  if (totalIncome > 0) {
    nodes.push({
      id: 'source-income', label: '💰 Income', color: getCategoryColor('income'), column: 'source',
      lineItems: incomeItems.map(i => ({ name: i.name, amount: i.actual })),
    });
  }

  // Column 2: Payment Methods
  const checkingColor = '#3b82f6';
  const creditColor = '#f59e0b';

  const activeAccountIds = Object.keys(methodCategorySpending);
  activeAccountIds.forEach(id => {
    const account = accountMap.get(id);
    if (!account) return;
    const isCredit = account.accountType === 'credit';
    const emoji = isCredit ? '💳' : '🏦';
    const color = isCredit ? creditColor : checkingColor;
    const suffix = account.lastFour ? ` ••${account.lastFour}` : '';

    nodes.push({
      id: `method-${id}`,
      label: `${emoji} ${account.accountName}${suffix}`,
      color,
      column: 'method',
      lineItems: Object.entries(methodCategorySpending[id]).map(([catKey, amt]) => ({
        name: budget.categories[catKey]?.name || catKey,
        amount: amt,
      })),
    });
  });

  const totalUnlinked = Object.values(unlinkedSpending).reduce((s, v) => s + v, 0);
  if (totalUnlinked > 0.01) {
    nodes.push({
      id: 'method-manual', label: '💵 Cash/Manual', color: '#6b7280', column: 'method',
      lineItems: Object.entries(unlinkedSpending).map(([catKey, amt]) => ({
        name: budget.categories[catKey]?.name || catKey,
        amount: amt,
      })),
    });
  }

  // Column 3: Categories
  categoriesWithSpending.forEach(({ key, category, items }) => {
    nodes.push({
      id: `category-${key}`,
      label: `${getCategoryEmoji(key, category.emoji)} ${category.name}`,
      color: getCategoryColor(key), column: 'category',
      lineItems: items.map(item => ({ name: item.name, amount: item.actual })),
    });
  });

  // Column 4: Items
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach(item => {
      nodes.push({ id: `item-${item.id}`, label: item.name, color: getCategoryColor(key), column: 'item' });
    });
  });

  // Links: Sources → Payment Methods (proportional)
  const allMethodNodes = nodes.filter(n => n.column === 'method');
  const totalMethodSpending = allMethodNodes.reduce((s, n) =>
    s + (n.lineItems?.reduce((sum, li) => sum + li.amount, 0) || 0), 0);

  if (totalMethodSpending > 0.01) {
    const sourceNodes = nodes.filter(n => n.column === 'source');
    sourceNodes.forEach(sourceNode => {
      const sourceAmount = sourceNode.id === 'source-buffer' ? bufferAmount : totalIncome;
      allMethodNodes.forEach(methodNode => {
        const methodTotal = methodNode.lineItems?.reduce((s, li) => s + li.amount, 0) || 0;
        const flowAmount = sourceAmount * (methodTotal / totalMethodSpending);
        if (flowAmount > 0.01) {
          links.push({ source: sourceNode.id, target: methodNode.id, value: flowAmount, color: methodNode.color || '#6b7280' });
        }
      });
    });
  }

  // Links: Payment Methods → Categories
  Object.entries(methodCategorySpending).forEach(([accountId, catSpending]) => {
    Object.entries(catSpending).forEach(([catKey, amount]) => {
      if (amount > 0.01) {
        links.push({ source: `method-${accountId}`, target: `category-${catKey}`, value: amount, color: getCategoryColor(catKey) });
      }
    });
  });
  Object.entries(unlinkedSpending).forEach(([catKey, amount]) => {
    if (amount > 0.01) {
      links.push({ source: 'method-manual', target: `category-${catKey}`, value: amount, color: getCategoryColor(catKey) });
    }
  });

  // Links: Categories → Items
  categoriesWithSpending.forEach(({ key, items }) => {
    items.forEach(item => {
      links.push({ source: `category-${key}`, target: `item-${item.id}`, value: item.actual, color: getCategoryColor(key) });
    });
  });

  return { nodes, links };
}

/**
 * Check if budget has discretionary spending (non-recurring items with actuals)
 */
export function hasDiscretionarySpending(budget: Budget | null): boolean {
  if (!budget) return false;
  return getExpenseCategoryKeys(budget).some((key) => {
    return budget.categories[key].items.some(
      (item) => !item.recurringPaymentId && item.actual > 0
    );
  });
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
