# Budget App

A modern zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. Features bank account integration via Teller for automatic transaction imports.

## Project Status

**Current Version:** v0.6.0 - Split Transactions & UI Improvements
**Last Updated:** 2026-01-16

### Tech Stack
- Next.js 16.x (App Router)
- TypeScript
- Tailwind CSS
- ESLint
- Drizzle ORM
- SQLite (better-sqlite3)
- Teller API (bank integration)
- React Hooks (useState, useEffect, useCallback)

### Features

#### Zero-Based Budgeting
- Every dollar of income is assigned to a category
- Starting balance (buffer) tracks money carried over from previous month
- Real-time budget summary showing planned vs actual spending
- Progress bars on budget items showing spend percentage

#### Budget Categories
- Income (separate tracking)
- Giving
- Household
- Transportation
- Food
- Personal
- Insurance
- Saving

#### Budget Item Management
- Add/remove items within each category
- Drag-and-drop reordering of budget items
- Set planned amounts for each budget item
- Actual amounts calculated automatically from transactions
- Expandable transaction list for each budget item

#### Bank Integration (Teller)
- Connect bank accounts via Teller Connect
- Automatic transaction import from linked accounts
- Support for multiple bank accounts
- Pending and posted transaction status tracking
- Automatic updates when pending transactions post

#### Transaction Management
- **New Transactions Tab**: View and categorize imported bank transactions
- **Tracked Transactions Tab**: View all categorized transactions
- **Deleted Transactions Tab**: View and restore soft-deleted transactions
- Assign transactions to budget items
- Edit transaction details (date, description, amount, merchant)
- Manual transaction entry with floating add button

#### Split Transactions
- Split a single transaction across multiple budget categories
- Example: Split a $45.50 Target charge into Household ($5.50), Pet Care ($25.00), and Grocery ($15.00)
- Visual balance indicator ensures splits equal the original amount
- Optional description for each split portion

#### Data Persistence
- All budget data stored in local SQLite database
- Multi-month support - create and manage budgets for different months/years
- Soft delete for transactions (recoverable)

### Database

The app uses SQLite for local data storage with Drizzle ORM for type-safe database operations.

**Database Commands:**
- `npm run db:push` - Push schema changes to database
- `npm run db:studio` - Open Drizzle Studio to view/edit data
- `npm run db:generate` - Generate migration files
- `npm run db:migrate` - Run migrations

**Database Schema:**
- **budgets** - Monthly budget containers (month, year, buffer amount)
- **budget_categories** - Categories within each budget (Income, Giving, etc.)
- **budget_items** - Individual line items (e.g., "Gas", "Groceries")
- **transactions** - Individual transactions linked to budget items
- **split_transactions** - Child allocations when a transaction is split across categories
- **linked_accounts** - Connected bank accounts from Teller

### How to Use

1. **Connect your bank** (optional): Go to Settings and connect your bank account via Teller
2. **Set starting balance**: Enter the buffer amount (money carried over from previous month)
3. **Set up your budget**: Add budget items to each category and set planned amounts
4. **Import transactions**: Click "Sync" in the Transactions tab to import from your bank
5. **Categorize transactions**: Assign imported transactions to budget items, or split them across multiple categories
6. **Track spending**: The actual amount updates automatically as you categorize transactions
7. **Stay balanced**: Keep your budget balanced by ensuring Buffer + Income = Total Expenses

### Environment Variables

For bank integration, you'll need Teller API credentials:

```env
TELLER_APPLICATION_ID=your_application_id
TELLER_ENVIRONMENT=sandbox  # or development, production
TELLER_SIGNING_SECRET=your_signing_secret
```

## Getting Started

```bash
npm install
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
budget-app/
├── app/
│   ├── api/
│   │   ├── budgets/          # Budget CRUD operations
│   │   ├── budget-items/     # Budget item management
│   │   ├── transactions/     # Transaction CRUD & split operations
│   │   └── teller/           # Bank sync & account management
│   ├── settings/             # Settings page
│   └── page.tsx              # Main budget page
├── components/
│   ├── AddTransactionModal.tsx
│   ├── BudgetHeader.tsx
│   ├── BudgetSection.tsx
│   ├── BudgetSummary.tsx
│   ├── BufferSection.tsx
│   ├── SplitTransactionModal.tsx
│   └── TransactionModal.tsx
├── db/
│   ├── index.ts              # Database connection
│   └── schema.ts             # Drizzle schema definitions
├── lib/
│   ├── budgetHelpers.ts      # Data transformation utilities
│   └── teller.ts             # Teller API client
└── types/
    └── budget.ts             # TypeScript type definitions
```

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Teller API](https://teller.io/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
