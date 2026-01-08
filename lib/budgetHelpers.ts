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
          items: cat.items.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            planned: item.planned,
            actual: item.transactions.reduce((sum: number, t: any) => sum + t.amount, 0),
            transactions: item.transactions.map((t: any) => ({
              id: t.id.toString(),
              date: t.date,
              description: t.description,
              amount: t.amount,
              budgetItemId: t.budgetItemId.toString(),
            })),
          })),
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