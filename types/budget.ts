export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  budgetItemId: string | null;
  linkedAccountId?: string | null;
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
  recurringPaymentId?: string | null;
}

export interface BudgetCategory {
  id: string;
  dbId?: string | null;
  name: string;
  emoji?: string | null;
  items: BudgetItem[];
}

// Default category keys — custom categories use slugified names
export type DefaultCategoryType =
  | 'income'
  | 'giving'
  | 'household'
  | 'transportation'
  | 'food'
  | 'personal'
  | 'insurance'
  | 'saving';

// CategoryType is now a string to support custom categories
export type CategoryType = string;

export const DEFAULT_CATEGORIES: DefaultCategoryType[] = [
  'income', 'giving', 'household', 'transportation', 'food', 'personal', 'insurance', 'saving',
];

export interface Budget {
  id?: string;
  month: number;
  year: number;
  buffer: number;
  categories: Record<string, BudgetCategory>;
}

export type RecurringFrequency = 'weekly' | 'bi-weekly' | 'monthly' | 'quarterly' | 'semi-annually' | 'annually';

export interface RecurringPayment {
  id: string;
  name: string;
  amount: number; // Per-occurrence amount (e.g., per paycheck for bi-weekly)
  frequency: RecurringFrequency;
  nextDueDate: string; // ISO date string
  fundedAmount: number; // Amount saved/received toward this payment
  categoryType?: CategoryType | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  // Computed fields
  monthlyContribution: number; // amount / months in cycle
  displayTarget: number; // Target amount for progress display (monthly equivalent for income, cycle total for expenses)
  percentFunded: number; // (fundedAmount / displayTarget) * 100
  isFullyFunded: boolean;
  daysUntilDue: number;
  isPaid: boolean; // True when payment conditions are met
}