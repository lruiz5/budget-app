import { Budget, BudgetCategory, DEFAULT_CATEGORIES } from '@/types/budget';

// Default category definitions for fallback initialization
const DEFAULT_CATEGORY_DEFS: Record<string, { name: string }> = {
  income: { name: 'Income' },
  giving: { name: 'Giving' },
  household: { name: 'Household' },
  transportation: { name: 'Transportation' },
  food: { name: 'Food' },
  personal: { name: 'Personal' },
  insurance: { name: 'Insurance' },
  saving: { name: 'Saving' },
};

export function transformDbBudgetToAppBudget(dbBudget: any): Budget {
  // Initialize with default categories
  const categories: Record<string, BudgetCategory> = {};
  for (const key of DEFAULT_CATEGORIES) {
    categories[key] = { id: key, dbId: null, name: DEFAULT_CATEGORY_DEFS[key].name, items: [] };
  }

  if (dbBudget.categories) {
    dbBudget.categories.forEach((cat: any) => {
      const categoryType = cat.categoryType;

      const mapItem = (item: any) => {
        // Filter out soft-deleted transactions
        const activeTransactions = item.transactions.filter((t: any) => !t.deletedAt);

        // Calculate actual from direct transactions
        const directActual = activeTransactions.reduce((sum: number, t: any) => {
          const amt = parseFloat(String(t.amount));
          if (categoryType === 'income') {
            return t.type === 'income' ? sum + amt : sum - amt;
          } else {
            return t.type === 'expense' ? sum + amt : sum - amt;
          }
        }, 0);

        // Add split transaction amounts
        const splitActual = (item.splitTransactions || []).reduce((sum: number, s: any) => {
          const amt = parseFloat(String(s.amount));
          const parentType = s.parentTransaction?.type;
          if (categoryType === 'income') {
            return parentType === 'income' ? sum + amt : sum - amt;
          } else {
            return parentType === 'expense' ? sum + amt : sum - amt;
          }
        }, 0);

        return {
          id: item.id.toString(),
          name: item.name,
          planned: parseFloat(String(item.planned)),
          actual: directActual + splitActual,
          recurringPaymentId: item.recurringPaymentId || null,
          transactions: activeTransactions.map((t: any) => ({
            id: t.id.toString(),
            date: t.date,
            description: t.description,
            amount: parseFloat(String(t.amount)),
            budgetItemId: t.budgetItemId?.toString() || null,
            linkedAccountId: t.linkedAccountId,
            type: t.type,
            merchant: t.merchant,
            isNonEarned: t.isNonEarned || false,
          })),
          splitTransactions: (item.splitTransactions || []).map((s: any) => ({
            id: s.id.toString(),
            parentTransactionId: s.parentTransactionId.toString(),
            amount: parseFloat(String(s.amount)),
            description: s.description,
            parentDate: s.parentTransaction?.date,
            parentMerchant: s.parentTransaction?.merchant,
            parentDescription: s.parentTransaction?.description,
            parentType: s.parentTransaction?.type,
            isNonEarned: s.isNonEarned || false,
          })),
        };
      };

      // Update existing default or add custom category
      categories[categoryType] = {
        id: cat.categoryType,
        dbId: cat.id,
        name: cat.name,
        emoji: cat.emoji || null,
        items: cat.items.map(mapItem),
      };
    });
  }

  return {
    id: dbBudget.id,
    month: dbBudget.month,
    year: dbBudget.year,
    buffer: parseFloat(String(dbBudget.buffer)) || 0,
    categories,
  };
}
