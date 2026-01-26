import { Budget, BudgetCategory } from '@/types/budget';

export function transformDbBudgetToAppBudget(dbBudget: any): Budget {
  const categories: any = {
    income: { id: 'income', dbId: null, name: 'Income', items: [] },
    giving: { id: 'giving', dbId: null, name: 'Giving', items: [] },
    household: { id: 'household', dbId: null, name: 'Household', items: [] },
    transportation: { id: 'transportation', dbId: null, name: 'Transportation', items: [] },
    food: { id: 'food', dbId: null, name: 'Food', items: [] },
    personal: { id: 'personal', dbId: null, name: 'Personal', items: [] },
    insurance: { id: 'insurance', dbId: null, name: 'Insurance', items: [] },
    saving: { id: 'saving', dbId: null, name: 'Saving', items: [] },
  };

  if (dbBudget.categories) {
    dbBudget.categories.forEach((cat: any) => {
      const categoryType = cat.categoryType as keyof typeof categories;
      if (categories[categoryType]) {
        categories[categoryType] = {
          id: cat.categoryType,
          dbId: cat.id,
          name: cat.name,
          items: cat.items.map((item: any) => {
            // Filter out soft-deleted transactions
            const activeTransactions = item.transactions.filter((t: any) => !t.deletedAt);

            // Calculate actual from direct transactions
            // Amounts are stored as positive in DB. The 'type' field indicates income vs expense.
            const directActual = activeTransactions.reduce((sum: number, t: any) => {
              // Income category: income adds, expense subtracts
              if (categoryType === 'income') {
                if (t.type === 'income') {
                  return sum + t.amount; // Add income to total earned
                } else {
                  return sum - t.amount; // Subtract expense from total earned
                }
              } else {
                // Expense categories: expenses add to spent, income (refunds) reduces spent
                if (t.type === 'expense') {
                  return sum + t.amount; // Add expense to total spent
                } else {
                  return sum - t.amount; // Subtract income (refund) from total spent
                }
              }
            }, 0);

            // Add split transaction amounts allocated to this budget item
            // Split amounts are always positive (portions of the parent transaction)
            const splitActual = (item.splitTransactions || []).reduce((sum: number, s: any) => sum + s.amount, 0);

            return {
              id: item.id.toString(),
              name: item.name,
              planned: item.planned,
              actual: directActual + splitActual,
              transactions: activeTransactions.map((t: any) => ({
                id: t.id.toString(),
                date: t.date,
                description: t.description,
                amount: t.amount,
                budgetItemId: t.budgetItemId?.toString() || null,
                linkedAccountId: t.linkedAccountId,
                type: t.type,
                merchant: t.merchant,
              })),
              // Include split transactions for display with parent info
              splitTransactions: (item.splitTransactions || []).map((s: any) => ({
                id: s.id.toString(),
                parentTransactionId: s.parentTransactionId.toString(),
                amount: s.amount,
                description: s.description,
                parentDate: s.parentTransaction?.date,
                parentMerchant: s.parentTransaction?.merchant,
                parentDescription: s.parentTransaction?.description,
                parentType: s.parentTransaction?.type,
              })),
            };
          }),
        };
      }
    });
  }

  return {
    id: dbBudget.id,
    month: dbBudget.month,
    year: dbBudget.year,
    buffer: dbBudget.buffer || 0,
    categories,
  };
}