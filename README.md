# Budget App

A modern zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. Features a dashboard interface with bank account integration via Teller for automatic transaction imports.

## Project Status

**Current Version:** v1.3.0 - Onboarding & Empty States (Final SQLite Release)
**Last Updated:** 2026-01-29

### Tech Stack
- Next.js 16.x (App Router)
- TypeScript
- Tailwind CSS
- ESLint
- Drizzle ORM
- SQLite (better-sqlite3) - **Final release using SQLite. Future versions will migrate to cloud storage.**
- Clerk (authentication)
- Teller API (bank integration)
- React Icons (react-icons)
- React Hooks (useState, useEffect, useCallback)

### Features

#### User Authentication
- Sign in / Sign up via Clerk
- Multi-user support - each user sees only their own data
- Secure route protection - all pages require authentication
- User account management via sidebar UserButton
- MFA support (configurable in Clerk dashboard)

#### Interactive Onboarding
- 6-step guided setup for new users
- Teaches zero-based budgeting concepts before hands-on setup
- Interactive steps: set buffer, create budget items, add first transaction
- Suggested items and transactions as quick-fill badges
- Progress saved in database — resume if interrupted
- Skip option for experienced users
- Revisitable via "Getting Started" link in sidebar

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
- **Edit existing splits** by clicking any split transaction:
  - From the Item Detail View activity list
  - From the Tracked Transactions tab in the sidebar
  - From the expanded transaction dropdown under budget items
- Opens the same Split Transaction modal, pre-populated with current split allocations
- Modify amounts, change budget items, add/remove splits, then save to update

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
- Empty state message when no spending recorded

**Potential Reallocation:**
- Categories under 50% utilized highlighted
- Suggestions for next month's budget adjustments
- Hidden for new users with no spending data

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
| `/onboarding` | Onboarding | Interactive 6-step guided setup for new users |
| `/sign-in` | Sign In | Clerk authentication - sign in page |
| `/sign-up` | Sign Up | Clerk authentication - sign up page |

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
- **budgets** - Monthly budget containers (userId, month, year, buffer amount)
- **budget_categories** - Categories within each budget (Income, Giving, etc.)
- **budget_items** - Individual line items (e.g., "Gas", "Groceries"), with optional link to recurring payments
- **transactions** - Individual transactions linked to budget items
- **split_transactions** - Child allocations when a transaction is split across categories
- **linked_accounts** - Connected bank accounts from Teller (userId, accessToken, institution info)
- **recurring_payments** - Recurring bills and subscriptions (userId, frequency, amount, due dates)
- **user_onboarding** - Onboarding progress tracking (userId, currentStep, completedAt, skippedAt)

**Note:** `userId` columns store the Clerk user ID for multi-user data isolation.

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

Create a `.env.local` file in the root directory. You can copy `.env.example` as a starting template:

```bash
cp .env.example .env.local
```

Then fill in your credentials:

**Authentication (Clerk):**
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

**Bank Integration (Teller):**
```env
TELLER_APP_ID=your_teller_app_id
NEXT_PUBLIC_TELLER_APP_ID=your_teller_app_id
TELLER_CERTIFICATE_PATH=./certificates/certificate.pem
TELLER_PRIVATE_KEY_PATH=./certificates/private_key.pem
TELLER_ENVIRONMENT=production
```

**Note:** `.env.local` is ignored by git to keep secrets safe. Never commit it to the repository.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Then edit `.env.local` and fill in your Clerk and Teller credentials.

3. **Set up the database:**
   ```bash
   npm run db:push
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Project Structure

```
budget-app/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── claim-data/       # Claim unclaimed data for user
│   │   ├── budgets/              # Budget CRUD operations
│   │   ├── onboarding/           # Onboarding status CRUD
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
│   ├── onboarding/
│   │   └── page.tsx              # Interactive onboarding flow
│   ├── recurring/
│   │   └── page.tsx              # Recurring payments page
│   ├── settings/
│   │   └── page.tsx              # Accounts page
│   ├── sign-in/
│   │   └── [[...sign-in]]/
│   │       └── page.tsx          # Clerk sign-in page
│   ├── sign-up/
│   │   └── [[...sign-up]]/
│   │       └── page.tsx          # Clerk sign-up page
│   ├── layout.tsx                # Root layout with ClerkProvider
│   └── page.tsx                  # Main budget page
├── components/
│   ├── AddTransactionModal.tsx   # Add/Edit transaction modal
│   ├── BudgetHeader.tsx          # Month header with navigation
│   ├── BudgetSection.tsx         # Category section component
│   ├── BudgetSummary.tsx         # Right sidebar summary
│   ├── BufferSection.tsx         # Buffer amount editor
│   ├── DashboardLayout.tsx       # Main layout wrapper
│   ├── MonthlyReportModal.tsx    # Monthly report modal
│   ├── Sidebar.tsx               # Collapsible navigation with UserButton
│   ├── SplitTransactionModal.tsx # Split transaction interface
│   ├── TransactionModal.tsx      # Transaction details modal
│   └── onboarding/              # Onboarding step components
│       ├── WelcomeStep.tsx       # Step 1: Welcome
│       ├── ConceptsStep.tsx      # Step 2: ZBB concepts
│       ├── BufferStep.tsx        # Step 3: Set buffer
│       ├── ItemsStep.tsx         # Step 4: Create items
│       ├── TransactionStep.tsx   # Step 5: First transaction
│       └── CompleteStep.tsx      # Step 6: Summary
├── db/
│   ├── index.ts                  # Database connection
│   └── schema.ts                 # Drizzle schema definitions
├── lib/
│   ├── auth.ts                   # Authentication helpers
│   ├── budgetHelpers.ts          # Data transformation utilities
│   └── teller.ts                 # Teller API client
├── scripts/
│   ├── check-schema.ts           # Verify database schema
│   ├── migrate-add-userid.ts     # Migration for userId columns
│   └── migrate-add-onboarding.ts # Migration for onboarding table
├── middleware.ts                 # Clerk route protection
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

### Onboarding
- `GET /api/onboarding` - Check onboarding status
- `POST /api/onboarding` - Initialize onboarding record
- `PUT /api/onboarding` - Update current step
- `PATCH /api/onboarding` - Complete or skip onboarding

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
