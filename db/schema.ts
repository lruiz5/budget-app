import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const budgets = sqliteTable('budgets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  buffer: real('buffer').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const budgetCategories = sqliteTable('budget_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  budgetId: integer('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
  categoryType: text('category_type').notNull(), // 'income', 'giving', etc.
  name: text('name').notNull(),
});

export const budgetItems = sqliteTable('budget_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id').notNull().references(() => budgetCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  planned: real('planned').notNull().default(0),
  order: integer('order').notNull().default(0),
  recurringPaymentId: integer('recurring_payment_id'), // Links to recurring_payments table
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  budgetItemId: integer('budget_item_id').references(() => budgetItems.id, { onDelete: 'set null' }),
  linkedAccountId: integer('linked_account_id').references(() => linkedAccounts.id),
  date: text('date').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
  type: text('type').notNull().$type<'income' | 'expense'>(),
  merchant: text('merchant'),
  checkNumber: text('check_number'),
  // Teller-specific fields
  tellerTransactionId: text('teller_transaction_id').unique(),
  tellerAccountId: text('teller_account_id'),
  status: text('status').$type<'posted' | 'pending'>(),
  // Soft delete
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Split transactions - child allocations of a parent transaction
export const splitTransactions = sqliteTable('split_transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentTransactionId: integer('parent_transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  budgetItemId: integer('budget_item_id').notNull().references(() => budgetItems.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  description: text('description'), // Optional context like "household items"
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Linked bank accounts from Teller
export const linkedAccounts = sqliteTable('linked_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tellerAccountId: text('teller_account_id').notNull().unique(),
  tellerEnrollmentId: text('teller_enrollment_id').notNull(),
  accessToken: text('access_token').notNull(),
  institutionName: text('institution_name').notNull(),
  institutionId: text('institution_id').notNull(),
  accountName: text('account_name').notNull(),
  accountType: text('account_type').notNull(), // 'depository' or 'credit'
  accountSubtype: text('account_subtype').notNull(), // 'checking', 'savings', 'credit_card', etc.
  lastFour: text('last_four').notNull(),
  status: text('status').notNull().$type<'open' | 'closed'>(),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Relations
export const budgetsRelations = relations(budgets, ({ many }) => ({
  categories: many(budgetCategories),
}));

export const budgetCategoriesRelations = relations(budgetCategories, ({ one, many }) => ({
  budget: one(budgets, {
    fields: [budgetCategories.budgetId],
    references: [budgets.id],
  }),
  items: many(budgetItems),
}));

export const budgetItemsRelations = relations(budgetItems, ({ one, many }) => ({
  category: one(budgetCategories, {
    fields: [budgetItems.categoryId],
    references: [budgetCategories.id],
  }),
  transactions: many(transactions),
  splitTransactions: many(splitTransactions),
}));

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  budgetItem: one(budgetItems, {
    fields: [transactions.budgetItemId],
    references: [budgetItems.id],
  }),
  linkedAccount: one(linkedAccounts, {
    fields: [transactions.linkedAccountId],
    references: [linkedAccounts.id],
  }),
  splits: many(splitTransactions),
}));

export const splitTransactionsRelations = relations(splitTransactions, ({ one }) => ({
  parentTransaction: one(transactions, {
    fields: [splitTransactions.parentTransactionId],
    references: [transactions.id],
  }),
  budgetItem: one(budgetItems, {
    fields: [splitTransactions.budgetItemId],
    references: [budgetItems.id],
  }),
}));

export const linkedAccountsRelations = relations(linkedAccounts, ({ many }) => ({
  transactions: many(transactions),
}));

// Recurring payments for subscriptions and memberships
export const recurringPayments = sqliteTable('recurring_payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  amount: real('amount').notNull(), // Total amount due when payment hits
  frequency: text('frequency').notNull().$type<'monthly' | 'quarterly' | 'semi-annually' | 'annually'>(),
  nextDueDate: text('next_due_date').notNull(), // ISO date string
  fundedAmount: real('funded_amount').notNull().default(0), // Amount saved toward this payment
  categoryType: text('category_type').$type<'income' | 'giving' | 'household' | 'transportation' | 'food' | 'personal' | 'insurance' | 'saving'>(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});