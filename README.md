# Budget App

A modern zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. Features a dashboard interface with bank account integration via Teller for automatic transaction imports.

## Project Status

**Current Version:** v0.8.0 - Recurring Payments & Budget Item Details
**Last Updated:** 2026-01-26

### Tech Stack
- Next.js 16.x (App Router)
- TypeScript
- Tailwind CSS
- ESLint
- Drizzle ORM
- SQLite (better-sqlite3)
- Teller API (bank integration)
- React Icons (react-icons)
- React Hooks (useState, useEffect, useCallback)

### Features

#### Dashboard Layout
- Collapsible sidebar navigation
- Three main sections: Budget, Accounts, Insights
- Responsive design with smooth transitions
- Monthly Summary accessible from sidebar sub-menu

#### Zero-Based Budgeting
- Every dollar of income is assigned to a category
- Starting balance (buffer) tracks money carried over from previous month
- Real-time budget summary showing planned vs actual spending
- Progress bars on budget items showing spend percentage
- Empty state display when navigating to months without a budget

#### Budget Header
- Clean month/year display as the main heading
- "Left to budget" or "Over budget" status indicator
- Previous/next month navigation with `<` `>` buttons
- Displays "Budget is balanced" when fully allocated

#### Budget Categories
Each category displays with an emoji indicator:
- 💰 Income (separate tracking)
- 🤲 Giving
- 🏠 Household
- 🚗 Transportation
- 🍽️ Food
- 👤 Personal
- 🛡️ Insurance
- 💵 Saving

#### Category Features
- Collapsible sections with expand/collapse all
- Checkmark indicator (✓) when category is fully fulfilled (planned = actual)
- Add/remove budget items within each category
- Drag-and-drop reordering of budget items
- Set planned amounts for each budget item
- Actual amounts calculated automatically from transactions
- Expandable transaction list showing all transactions per line item
- Transactions sorted by date descending (most recent first)
- Split transactions displayed under their assigned budget items
- 🔄 emoji indicator on budget items linked to recurring payments
- Click any budget item to view details in sidebar

#### Budget Item Detail View
Click any budget item to see a detailed sidebar view:
- Circular progress indicator showing percentage spent
- Remaining balance prominently displayed
- Item name and category
- Spent vs planned amounts
- "Make this recurring" option to create a recurring payment
- 🔄 indicator if already linked to a recurring payment
- Activity list showing all transactions for this item
- Income transactions displayed in green

#### Recurring Payments
Accessible via sidebar navigation:
- Create and manage recurring bills and subscriptions
- Support for multiple frequencies: Monthly, Quarterly, Semi-Annually, Annually
- Automatic monthly contribution calculation for non-monthly payments
- Link budget items to recurring payments for tracking
- Progress bar showing funding status toward next payment
- "Paid" indicator when fully funded
- 60-day upcoming payments warning banner
- Category assignment for auto-creation in new budgets
- Due date tracking with days-until-due display

#### Buffer Section
- 💼 Buffer tracks money carried over from previous month
- Editable amount with inline editing
- Clean white card styling matching other sections

#### Bank Integration (Teller)
- Connect bank accounts via Teller Connect
- Automatic transaction import from linked accounts
- Support for multiple bank accounts
- Pending and posted transaction status tracking
- Automatic updates when pending transactions post
- Last synced timestamp for each account

#### Transaction Management
- **New Transactions Tab**: View and categorize imported bank transactions
- **Tracked Transactions Tab**: View all categorized transactions including split portions
- **Deleted Transactions Tab**: View and restore soft-deleted transactions
- Assign transactions to budget items via dropdown
- Edit transaction details (date, description, amount, merchant, type)
- Manual transaction entry with floating add button
- Click on any transaction to edit or delete

#### Split Transactions
- Split a single transaction across multiple budget categories
- Example: Split a $45.50 Target charge into Household ($5.50), Pet Care ($25.00), and Grocery ($15.00)
- Visual balance indicator ensures splits equal the original amount
- Optional description for each split portion
- Parent transactions with splits are hidden from "New" list
- Split portions appear in Tracked tab with parent transaction info

#### Monthly Report
Comprehensive end-of-month budget review accessed via Insights > Monthly Summary:

**Overall Summary:**
- Total Income with trend vs previous month
- Total Expenses with trend vs previous month
- Net Savings calculation
- Savings Rate percentage
- Planned vs Actual comparison

**Buffer Flow:**
- Current Buffer amount
- Total Underspent (sum of all under-budget items)
- Total Overspent (sum of all over-budget items)
- Projected Next Month Buffer calculation

**Category Breakdown:**
- Each category with planned, actual, and difference
- Progress bar showing utilization percentage
- Over/Under budget indicator
- Month-over-month trend comparison

**Top Spending Items:**
- Top 10 spending items ranked by amount
- Shows category, planned, actual, and percentage of total spending

**Potential Reallocation:**
- Categories under 50% utilized highlighted
- Suggestions for next month's budget adjustments

#### Data Persistence
- All budget data stored in local SQLite database
- Multi-month support - create and manage budgets for different months/years
- Soft delete for transactions (recoverable)
- Automatic budget creation when navigating to new month

### Pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | Budget | Main budget view with categories, transactions, and summary |
| `/recurring` | Recurring | Manage recurring payments and subscriptions |
| `/settings` | Accounts | Bank account management and Teller integration |
| `/insights` | Insights | Insights hub with Monthly Summary and future analytics |

### Database

The app uses SQLite for local data storage with Drizzle ORM for type-safe database operations.

**Database Commands:**
```bash
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio to view/edit data
npm run db:generate  # Generate migration files
npm run db:migrate   # Run migrations
```

**Database Schema:**
- **budgets** - Monthly budget containers (month, year, buffer amount)
- **budget_categories** - Categories within each budget (Income, Giving, etc.)
- **budget_items** - Individual line items (e.g., "Gas", "Groceries"), with optional link to recurring payments
- **transactions** - Individual transactions linked to budget items
- **split_transactions** - Child allocations when a transaction is split across categories
- **linked_accounts** - Connected bank accounts from Teller
- **recurring_payments** - Recurring bills and subscriptions with frequency, amount, and due dates

### How to Use

1. **Navigate the Dashboard**: Use the collapsible sidebar to access Budget, Accounts, and Insights
2. **Connect your bank** (optional): Go to Accounts and connect your bank account via Teller
3. **Set starting balance**: Enter the buffer amount (money carried over from previous month)
4. **Set up your budget**: Add budget items to each category and set planned amounts
5. **Import transactions**: Click "Sync All" in the Accounts page to import from your bank
6. **Categorize transactions**: In the Budget view, assign transactions from the "New" tab to budget items, or split them across multiple categories
7. **Track spending**: The actual amount updates automatically as you categorize transactions
8. **Stay balanced**: Keep your budget balanced by ensuring Buffer + Income = Total Expenses
9. **Review monthly**: Use Insights > Monthly Summary to review your spending and plan for next month

### Environment Variables

For bank integration, you'll need Teller API credentials:

```env
NEXT_PUBLIC_TELLER_APP_ID=your_application_id
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
│   │   ├── budgets/              # Budget CRUD operations
│   │   ├── budget-items/         # Budget item management
│   │   │   └── reorder/          # Drag-and-drop reorder endpoint
│   │   ├── recurring-payments/   # Recurring payment CRUD
│   │   ├── transactions/         # Transaction CRUD
│   │   │   └── split/            # Split transaction operations
│   │   └── teller/               # Bank integration
│   │       ├── accounts/         # Account management
│   │       └── sync/             # Transaction sync
│   ├── insights/
│   │   └── page.tsx              # Insights page
│   ├── recurring/
│   │   └── page.tsx              # Recurring payments page
│   ├── settings/
│   │   └── page.tsx              # Accounts page
│   ├── layout.tsx                # Root layout
│   └── page.tsx                  # Main budget page
├── components/
│   ├── AddTransactionModal.tsx   # Add/Edit transaction modal
│   ├── BudgetHeader.tsx          # Month header with navigation
│   ├── BudgetSection.tsx         # Category section component
│   ├── BudgetSummary.tsx         # Right sidebar summary
│   ├── BufferSection.tsx         # Buffer amount editor
│   ├── DashboardLayout.tsx       # Main layout wrapper
│   ├── MonthlyReportModal.tsx    # Monthly report modal
│   ├── Sidebar.tsx               # Collapsible navigation sidebar
│   ├── SplitTransactionModal.tsx # Split transaction interface
│   └── TransactionModal.tsx      # Transaction details modal
├── db/
│   ├── index.ts                  # Database connection
│   └── schema.ts                 # Drizzle schema definitions
├── lib/
│   ├── budgetHelpers.ts          # Data transformation utilities
│   └── teller.ts                 # Teller API client
└── types/
    └── budget.ts                 # TypeScript type definitions
```

## API Endpoints

### Budgets
- `GET /api/budgets?month=X&year=Y` - Get or create budget for month/year
- `PUT /api/budgets` - Update budget (buffer amount)

### Budget Items
- `POST /api/budget-items` - Create new budget item
- `PUT /api/budget-items` - Update budget item
- `DELETE /api/budget-items?id=X` - Delete budget item
- `POST /api/budget-items/reorder` - Reorder items via drag-and-drop

### Transactions
- `POST /api/transactions` - Create transaction
- `PUT /api/transactions` - Update transaction
- `DELETE /api/transactions?id=X` - Soft delete transaction
- `PATCH /api/transactions` - Restore deleted transaction
- `POST /api/transactions/split` - Split transaction across categories

### Recurring Payments
- `GET /api/recurring-payments` - Get all active recurring payments
- `POST /api/recurring-payments` - Create recurring payment (optionally link to budget item)
- `PUT /api/recurring-payments` - Update recurring payment
- `DELETE /api/recurring-payments?id=X` - Delete recurring payment and unlink budget items

### Teller Integration
- `GET /api/teller/accounts` - Get linked accounts
- `POST /api/teller/accounts` - Link new account
- `DELETE /api/teller/accounts?id=X` - Unlink account
- `POST /api/teller/sync` - Sync transactions from all linked accounts

## Learn More

To learn more about the technologies used:

- [Next.js Documentation](https://nextjs.org/docs)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Teller API](https://teller.io/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [React Icons](https://react-icons.github.io/react-icons/)
