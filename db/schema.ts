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
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const transactions = sqliteTable('transactions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  budgetItemId: integer('budget_item_id').notNull().references(() => budgetItems.id, { onDelete: 'cascade' }),
  date: text('date').notNull(),
  description: text('description').notNull(),
  amount: real('amount').notNull(),
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
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  budgetItem: one(budgetItems, {
    fields: [transactions.budgetItemId],
    references: [budgetItems.id],
  }),
}));