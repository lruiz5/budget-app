# Claude Context Document

This document contains context for Claude AI to continue development on this budget app. Use this to quickly get up to speed when starting a new session.

## Project Overview

A zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. The app features bank account integration via Teller API for automatic transaction imports.

**Current Version:** v0.8.0
**Last Session:** 2026-01-26

## Tech Stack

- **Framework:** Next.js 16.x (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **ORM:** Drizzle ORM
- **Database:** SQLite (better-sqlite3)
- **Bank Integration:** Teller API
- **Icons:** react-icons (FaXxx from react-icons/fa, HiXxx from react-icons/hi2)

## Key Concepts

### Zero-Based Budgeting
- Every dollar of income must be assigned to a category
- Formula: Buffer + Income = Total Expenses (when balanced)
- Buffer = money carried over from previous month

### Budget Structure
```
Budget (month/year)
├── Buffer (starting balance)
├── Categories
│   ├── Income (special - tracked separately)
│   ├── Giving
│   ├── Household
│   ├── Transportation
│   ├── Food
│   ├── Personal
│   ├── Insurance
│   └── Saving
└── Each category has Budget Items (line items)
    └── Each item has Transactions and Split Transactions
```

## Database Schema (db/schema.ts)

### Key Tables

1. **budgets** - Monthly budget containers
   - id, month, year, buffer, createdAt

2. **budget_categories** - Categories within each budget
   - id, budgetId, categoryType, name, order

3. **budget_items** - Line items within categories
   - id, categoryId, name, planned, order, **recurringPaymentId** (links to recurring_payments)

4. **transactions** - Individual transactions
   - id, budgetItemId, linkedAccountId, date, description, amount, type ('income'|'expense'), merchant, deletedAt (soft delete)

5. **split_transactions** - When a transaction is split across multiple budget items
   - id, parentTransactionId, budgetItemId, amount, description

6. **recurring_payments** - Recurring bills and subscriptions
   - id, name, amount, frequency, nextDueDate, fundedAmount, categoryType, isActive

7. **linked_accounts** - Connected bank accounts from Teller

### Important Relationships

- `budget_items.recurringPaymentId` links a budget item to a recurring payment
- When a recurring payment has a categoryType, budget items are auto-created in new months
- Split transactions reference both the parent transaction AND a budget item

## Recent Changes (v0.8.0)

### Recurring Payments Feature
- Full CRUD at `/recurring` page
- Frequencies: monthly, quarterly, semi-annually, annually
- Auto-calculates monthly contribution for non-monthly payments
- Progress tracking toward next payment due date
- 60-day warning banner for upcoming payments
- **Linking:** Budget items can be linked to recurring payments via `recurringPaymentId`

### Budget Item Detail View
- Click any budget item to see details in the right sidebar
- Shows: circular progress indicator, remaining balance, transactions list
- "Make this recurring" button navigates to `/recurring` with pre-filled data AND passes `budgetItemId` to link them

### Buffer Flow in Monthly Report
- Located in Insights > Monthly Summary modal
- Shows: Current Buffer, + Underspent, - Overspent, = Projected Next Month Buffer
- Calculation: `nextBuffer = buffer + underspent - overspent`
- Note: Income variance was intentionally removed per user request

### Transaction Colors
- Income transactions display in green (`text-green-600`)
- Expense transactions display in black/gray (`text-gray-900`)
- Applied in both BudgetSection dropdown and BudgetSummary item detail view

### Recurring Payment Emoji
- Budget items linked to recurring payments show 🔄 emoji
- Displayed in BudgetSection.tsx next to item name

## Key Files and Their Purposes

### Pages (app/)
- `page.tsx` - Main budget view with all categories
- `recurring/page.tsx` - Recurring payments management
- `settings/page.tsx` - Bank account management (Teller)
- `insights/page.tsx` - Insights hub with Monthly Summary access

### Components (components/)
- `BudgetSection.tsx` - Renders a single category with its items, handles drag-drop reorder
- `BudgetSummary.tsx` - Right sidebar with Summary/Transactions tabs AND budget item detail view
- `MonthlyReportModal.tsx` - Monthly report with Buffer Flow section
- `DashboardLayout.tsx` - Main layout wrapper with sidebar
- `Sidebar.tsx` - Collapsible navigation sidebar
- `AddTransactionModal.tsx` - Add/edit transaction modal
- `SplitTransactionModal.tsx` - Split transaction interface

### API Routes (app/api/)
- `budgets/route.ts` - GET creates/returns budget, syncs recurring payments to budget items
- `recurring-payments/route.ts` - Full CRUD, DELETE unlinks budget items first
- `transactions/route.ts` - CRUD with soft delete support
- `transactions/split/route.ts` - Split transaction creation
- `teller/` - Bank integration endpoints

### Utilities (lib/)
- `budgetHelpers.ts` - `transformDbBudgetToAppBudget()` transforms DB data to app types
- `teller.ts` - Teller API client

### Types (types/)
- `budget.ts` - All TypeScript interfaces (Budget, BudgetItem, Transaction, etc.)

## Important Code Patterns

### Fetching Budget
```typescript
const response = await fetch(`/api/budgets?month=${m}&year=${y}`);
const data = await response.json();
const transformedBudget = transformDbBudgetToAppBudget(data);
```

### Linking Budget Item to Recurring Payment
When creating a recurring payment from "Make this recurring":
1. URL params include `budgetItemId`
2. POST to `/api/recurring-payments` includes `budgetItemId` in body
3. API updates budget item: `set({ recurringPaymentId: payment.id })`

### Deleting Recurring Payment
Must unlink budget items FIRST, then delete:
```typescript
await db.update(budgetItems).set({ recurringPaymentId: null }).where(eq(budgetItems.recurringPaymentId, paymentId));
await db.delete(recurringPayments).where(eq(recurringPayments.id, paymentId));
```

### Auto-sync Recurring to Budget Items
In `api/budgets/route.ts` GET handler:
- Fetches all active recurring payments
- For each with a categoryType, checks if budget item exists in matching category
- Creates budget item if missing, with `recurringPaymentId` set

## UI Patterns

### Colors
- Income/positive: `text-green-600`
- Expense/negative: `text-red-600`
- Neutral: `text-gray-900`
- Over budget: `text-red-600`
- Under budget: `text-green-600`

### Category Emojis
```typescript
const emojiMap: Record<string, string> = {
  'Income': '💰', 'Giving': '🤲', 'Household': '🏠',
  'Transportation': '🚗', 'Food': '🍽️', 'Personal': '👤',
  'Insurance': '🛡️', 'Saving': '💵'
};
```

### Recurring Indicator
- 🔄 emoji shown on budget items with `recurringPaymentId`
- Also shown in item detail view as "Recurring payment" label

## Known State / Pending Items

### Working Features
- Full budget CRUD with categories and items
- Transaction management (add, edit, soft delete, restore)
- Split transactions across multiple budget items
- Bank integration via Teller
- Recurring payments with linking to budget items
- Budget item detail view in sidebar
- Monthly report with Buffer Flow
- Copy budget from previous month

### Potential Future Work
- The "Add Group" button at bottom of budget page is non-functional (placeholder)
- Could add ability to edit recurring payment from budget item detail view
- Could add recurring payment auto-advance when marked as paid

## Development Commands

```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio to view/edit data
npm run build        # Production build
```

## Testing Notes

When testing recurring payments:
1. Create a recurring payment with a category
2. Navigate to a new month - budget item should auto-create
3. Click budget item, use "Make this recurring" to link existing item
4. Verify 🔄 emoji appears after linking
5. Delete recurring payment - verify budget items are unlinked (not deleted)

## Common Issues & Solutions

### Recurring emoji not showing after "Make this recurring"
- Fixed: POST endpoint now accepts `budgetItemId` and updates the budget item

### Delete not working for recurring payments
- Fixed: DELETE endpoint now unlinks budget items before deleting

### Buffer Flow showing wrong values
- Underspent = sum of (planned - actual) where planned > actual
- Overspent = sum of (actual - planned) where actual > planned
- Only expense categories are included (not income)

## Session Handoff Notes

Last session ended after:
1. Adding Buffer Flow section to MonthlyReportModal
2. Removing Income Variance from Buffer Flow per user request
3. Renaming "= Next Month Buffer" to "Projected Next Month Buffer"
4. Updating README.md to v0.8.0

The app is in a stable state with all recent features working.
