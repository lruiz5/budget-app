import { pgTable, serial, text, integer, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const budgets = pgTable('budgets', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default(''), // Clerk user ID
  month: integer('month').notNull(),
  year: integer('year').notNull(),
  buffer: numeric('buffer', { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$defaultFn(() => new Date()),
});

export const budgetCategories = pgTable('budget_categories', {
  id: serial('id').primaryKey(),
  budgetId: integer('budget_id').notNull().references(() => budgets.id, { onDelete: 'cascade' }),
  categoryType: text('category_type').notNull(), // 'income', 'giving', etc. or custom slug
  name: text('name').notNull(),
  emoji: text('emoji'), // Custom emoji for user-created categories (null for defaults)
  categoryOrder: integer('category_order').notNull().default(0),
});

export const budgetItems = pgTable('budget_items', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id').notNull().references(() => budgetCategories.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  planned: numeric('planned', { precision: 10, scale: 2 }).notNull().default('0'),
  order: integer('order').notNull().default(0),
  recurringPaymentId: integer('recurring_payment_id'), // Links to recurring_payments table
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
});

export const transactions = pgTable('transactions', {
  id: serial('id').primaryKey(),
  budgetItemId: integer('budget_item_id').references(() => budgetItems.id, { onDelete: 'set null' }),
  linkedAccountId: integer('linked_account_id').references(() => linkedAccounts.id),
  date: text('date').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  type: text('type').notNull().$type<'income' | 'expense'>(),
  merchant: text('merchant'),
  checkNumber: text('check_number'),
  // Teller-specific fields
  tellerTransactionId: text('teller_transaction_id').unique(),
  tellerAccountId: text('teller_account_id'),
  status: text('status').$type<'posted' | 'pending'>(),
  isNonEarned: boolean('is_non_earned').notNull().default(false),
  // Soft delete
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
});

// Split transactions - child allocations of a parent transaction
export const splitTransactions = pgTable('split_transactions', {
  id: serial('id').primaryKey(),
  parentTransactionId: integer('parent_transaction_id').notNull().references(() => transactions.id, { onDelete: 'cascade' }),
  budgetItemId: integer('budget_item_id').notNull().references(() => budgetItems.id, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  description: text('description'), // Optional context like "household items"
  isNonEarned: boolean('is_non_earned').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
});

// Linked bank accounts from Teller
export const linkedAccounts = pgTable('linked_accounts', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default(''), // Clerk user ID
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
  syncEnabled: boolean('sync_enabled').notNull().default(true),
  syncStartDate: text('sync_start_date'), // YYYY-MM-DD, set when sync first enabled
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
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

// User onboarding tracking
export const userOnboarding = pgTable('user_onboarding', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  currentStep: integer('current_step').notNull().default(1),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  skippedAt: timestamp('skipped_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
});

export const userOnboardingRelations = relations(userOnboarding, () => ({}));

// Recurring payments for subscriptions and memberships
export const recurringPayments = pgTable('recurring_payments', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().default(''), // Clerk user ID
  name: text('name').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(), // Total amount due when payment hits
  frequency: text('frequency').notNull().$type<'monthly' | 'quarterly' | 'semi-annually' | 'annually'>(),
  nextDueDate: text('next_due_date').notNull(), // ISO date string
  fundedAmount: numeric('funded_amount', { precision: 10, scale: 2 }).notNull().default('0'),
  categoryType: text('category_type').$type<'income' | 'giving' | 'household' | 'transportation' | 'food' | 'personal' | 'insurance' | 'saving'>(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at', { withTimezone: true }).$defaultFn(() => new Date()),
});
