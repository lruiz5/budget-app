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
  recurringPaymentId?: number | null;
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

export type RecurringFrequency = 'monthly' | 'quarterly' | 'semi-annually' | 'annually';

export interface RecurringPayment {
  id: number;
  name: string;
  amount: number; // Total amount due
  frequency: RecurringFrequency;
  nextDueDate: string; // ISO date string
  fundedAmount: number; // Amount saved toward this payment
  categoryType?: CategoryType | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  // Computed fields
  monthlyContribution: number; // amount / months in cycle
  percentFunded: number; // (fundedAmount / amount) * 100
  isFullyFunded: boolean;
  daysUntilDue: number;
  isPaid: boolean; // True when payment conditions are met
}