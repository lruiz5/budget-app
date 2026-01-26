export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  budgetItemId: string | null;
  linkedAccountId?: number | null;
  type: 'income' | 'expense';
  merchant?: string | null;
  checkNumber?: string | null;
  // Teller-specific fields
  tellerTransactionId?: string | null;
  tellerAccountId?: string | null;
  status?: 'posted' | 'pending' | null;
}

export interface SplitTransaction {
  id: string;
  parentTransactionId: string;
  amount: number;
  description?: string | null;
  // Parent transaction info for display
  parentDate?: string;
  parentMerchant?: string | null;
  parentDescription?: string;
  parentType?: 'income' | 'expense';
}

export interface BudgetItem {
  id: string;
  name: string;
  planned: number;
  actual: number;
  transactions: Transaction[];
  splitTransactions?: SplitTransaction[];
}

export interface BudgetCategory {
  id: string;
  dbId?: number | null;
  name: string;
  items: BudgetItem[];
}

export type CategoryType =
  | 'income'
  | 'giving'
  | 'household'
  | 'transportation'
  | 'food'
  | 'personal'
  | 'insurance'
  | 'saving';

export interface Budget {
  id?: number;
  month: number;
  year: number;
  buffer: number;
  categories: {
    income: BudgetCategory;
    giving: BudgetCategory;
    household: BudgetCategory;
    transportation: BudgetCategory;
    food: BudgetCategory;
    personal: BudgetCategory;
    insurance: BudgetCategory;
    saving: BudgetCategory;
  };
}