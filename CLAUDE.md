# Claude Context Document

This document contains context for Claude AI to continue development on this budget app. Use this to quickly get up to speed when starting a new session.

## Project Overview

A zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. The app features bank account integration via Teller API for automatic transaction imports.

**Current Version:** v1.9.0
**Last Session:** 2026-02-04

## Instructions for Claude

- **Do NOT commit** unless explicitly authorized by the user
- Wait for user approval before running `git commit`, `git push`, or similar commands
- When changes are ready, describe what would be committed and ask if the user wants to proceed

## Tech Stack

- **Framework:** Next.js 16.x (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **ORM:** Drizzle ORM
- **Database:** Supabase (PostgreSQL) — migrated from SQLite in v1.4.0
- **Authentication:** Clerk (@clerk/nextjs)
- **Bank Integration:** Teller API
- **Mobile:** Capacitor (live server mode) + Native iOS (SwiftUI)
- **Charts:** D3.js + d3-sankey
- **Icons:** react-icons (FaXxx from react-icons/fa only)

## iOS App (SwiftUI)

Native iOS app built with SwiftUI targeting iOS 17+. Located in `ios/BudgetApp/`.

### Tech Stack
- **Language:** Swift 5.9+
- **UI Framework:** SwiftUI (iOS 17+)
- **Architecture:** MVVM
- **Authentication:** Clerk iOS SDK
- **Networking:** URLSession + async/await

### Project Structure
```
ios/BudgetApp/
├── BudgetApp.xcodeproj
├── BudgetApp/
│   ├── App/
│   │   └── BudgetAppApp.swift       # Entry point with Clerk auth
│   ├── Models/
│   │   ├── Budget.swift             # Budget, BudgetCategory, BudgetItem
│   │   ├── Transaction.swift        # Transaction, SplitTransaction
│   │   ├── LinkedAccount.swift
│   │   └── RecurringPayment.swift
│   ├── Services/
│   │   ├── APIClient.swift          # Generic HTTP client
│   │   ├── BudgetService.swift
│   │   ├── AccountsService.swift
│   │   ├── TransactionService.swift
│   │   └── RecurringService.swift
│   ├── ViewModels/
│   │   ├── BudgetViewModel.swift
│   │   ├── TransactionsViewModel.swift
│   │   ├── AccountsViewModel.swift
│   │   ├── InsightsViewModel.swift
│   │   └── RecurringViewModel.swift
│   ├── Views/
│   │   ├── Budget/                  # BudgetView, CategorySection, etc.
│   │   ├── Transactions/            # TransactionsView
│   │   ├── Accounts/                # AccountsView
│   │   ├── Insights/                # InsightsView
│   │   ├── Settings/                # SettingsView, RecurringPaymentsView
│   │   ├── Onboarding/              # SignInView
│   │   └── Components/              # MonthYearPicker, etc.
│   └── Utilities/
│       ├── Constants.swift          # API base URL, Clerk keys
│       └── Extensions.swift
```

### Key Implementation Details

**Month Indexing (Critical!):**
- Web app uses 0-indexed months (JavaScript `Date.getMonth()`: Jan=0, Feb=1)
- Swift uses 1-indexed months (`Calendar.component(.month)`: Jan=1, Feb=2)
- iOS app converts to 0-indexed before API calls: `selectedMonth = calendar.component(.month, from: now) - 1`

**Date Parsing:**
- Transaction `date` field: "YYYY-MM-DD" format (not ISO8601)
- Timestamps (`createdAt`, `deletedAt`): ISO8601 with optional fractional seconds
- Custom decoders handle both formats in Transaction.swift and Budget.swift

**Actual Calculation:**
- Backend returns transactions but NOT pre-calculated `actual` amounts
- iOS calculates actuals client-side in `BudgetItem.calculateActual(isIncomeCategory:)`
- For income categories: income adds, expense subtracts
- For expense categories: expense adds, income subtracts
- Includes both direct transactions and split transactions

**PostgreSQL Numeric Handling:**
- PostgreSQL returns numeric fields as strings
- All amount fields use custom decoding: `Decimal(string: amountString) ?? 0`

**Auth Token Timing:**
- `BudgetAppApp.swift` uses `isAuthReady` state to prevent API calls before token is set
- Shows "Preparing..." while fetching token after Clerk login

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
   - id, **userId**, month, year, buffer, createdAt

2. **budget_categories** - Categories within each budget
   - id, budgetId, categoryType, name, order

3. **budget_items** - Line items within categories
   - id, categoryId, name, planned, order, **recurringPaymentId** (links to recurring_payments)

4. **transactions** - Individual transactions
   - id, budgetItemId, linkedAccountId, date, description, amount, type ('income'|'expense'), merchant, deletedAt (soft delete)

5. **split_transactions** - When a transaction is split across multiple budget items
   - id, parentTransactionId, budgetItemId, amount, description

6. **recurring_payments** - Recurring bills and subscriptions
   - id, **userId**, name, amount, frequency, nextDueDate, fundedAmount, categoryType, isActive

7. **linked_accounts** - Connected bank accounts from Teller
   - id, **userId**, tellerAccountId, accessToken, institutionName, etc.

8. **user_onboarding** - Onboarding progress tracking
   - id, **userId** (unique), currentStep, completedAt, skippedAt, createdAt

### User Data Isolation
- `budgets`, `linked_accounts`, and `recurring_payments` have `userId` columns (Clerk user ID)
- Child tables (budgetCategories, budgetItems, transactions, splitTransactions) inherit ownership through parent relationships
- All API routes verify ownership before returning/modifying data

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

## Recent Changes (v0.9.0)

### Split Transaction Editing
- Click any split transaction to open the SplitTransactionModal pre-populated with existing splits
- Editable from three locations:
  1. **Item Detail View**: Click split transactions in the activity list
  2. **Tracked Transactions Tab**: Click split transactions in the sidebar
  3. **BudgetSection Dropdown**: Click split transactions in the expanded transaction list under budget items
- Modal shows "Edit Split" title when editing (vs "Split Transaction" for new)
- `ExistingSplit` interface added to SplitTransactionModal.tsx
- Cross-component communication via state lifting in page.tsx (`splitToEdit`, `handleSplitClick`, `clearSplitToEdit`)

### Implementation Details
- `SplitTransactionModal.tsx`: Added `existingSplits` prop and `isEditMode` logic
- `BudgetSummary.tsx`: Added `fetchAndOpenSplitModal()` function, `splitToEdit` prop handling
- `BudgetSection.tsx`: Added `onSplitClick` prop for split transaction click handling
- `page.tsx`: Added state management for cross-component split editing

## Recent Changes (v1.0.0)

### Clerk Authentication
- Full user authentication via Clerk (@clerk/nextjs)
- Sign-in and sign-up pages with Clerk components
- Route protection via middleware - all routes except /sign-in and /sign-up require authentication
- UserButton in sidebar footer for account management and sign-out

### Multi-User Support
- `userId` column added to: `budgets`, `linked_accounts`, `recurring_payments`
- All API routes check authentication and scope queries to the authenticated user
- New users automatically get a fresh budget created on first visit
- Existing data can be claimed via `/api/auth/claim-data` endpoint

### Auth Implementation Details
- `middleware.ts`: Uses `clerkMiddleware` with `createRouteMatcher` for route protection
- `lib/auth.ts`: Helper functions `requireAuth()` and `isAuthError()` for API routes
- All 11 API route files updated with auth checks and userId scoping
- Migration script: `scripts/migrate-add-userid.ts` for adding userId columns to existing DB

### Environment Variables (Clerk)
```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

## Key Files and Their Purposes

### Pages (app/)
- `page.tsx` - Main budget view with all categories (includes onboarding redirect check)
- `recurring/page.tsx` - Recurring payments management
- `settings/page.tsx` - Bank account management (Teller)
- `insights/page.tsx` - Insights hub with Monthly Summary access
- `onboarding/page.tsx` - Interactive onboarding flow (6 steps, standalone layout)
- `sign-in/[[...sign-in]]/page.tsx` - Clerk sign-in page
- `sign-up/[[...sign-up]]/page.tsx` - Clerk sign-up page (redirects to `/onboarding`)

### Components (components/)
- `BudgetSection.tsx` - Renders a single category with its items, handles drag-drop reorder
- `BudgetSummary.tsx` - Right sidebar with Summary/Transactions tabs AND budget item detail view
- `MonthlyReportModal.tsx` - Monthly report with Buffer Flow section and empty-state handling
- `DashboardLayout.tsx` - Main layout wrapper with sidebar
- `Sidebar.tsx` - Collapsible navigation sidebar with UserButton and "Getting Started" link
- `AddTransactionModal.tsx` - Add/edit transaction modal
- `SplitTransactionModal.tsx` - Split transaction interface
- `onboarding/WelcomeStep.tsx` - Step 1: Welcome screen
- `onboarding/ConceptsStep.tsx` - Step 2: Zero-based budgeting explainer
- `onboarding/BufferStep.tsx` - Step 3: Interactive buffer input
- `onboarding/ItemsStep.tsx` - Step 4: Category cards with suggested items
- `onboarding/TransactionStep.tsx` - Step 5: First transaction with suggested transactions
- `onboarding/CompleteStep.tsx` - Step 6: Celebration and summary

### API Routes (app/api/)
- `budgets/route.ts` - GET creates/returns budget, syncs recurring payments to budget items
- `onboarding/route.ts` - Onboarding status CRUD (GET/POST/PUT/PATCH)
- `recurring-payments/route.ts` - Full CRUD, DELETE unlinks budget items first
- `transactions/route.ts` - CRUD with soft delete support
- `transactions/split/route.ts` - Split transaction creation
- `teller/` - Bank integration endpoints
- `auth/claim-data/route.ts` - Claim unclaimed data for migrating users

### Utilities (lib/)
- `budgetHelpers.ts` - `transformDbBudgetToAppBudget()` transforms DB data to app types
- `teller.ts` - Teller API client
- `auth.ts` - Authentication helpers (`requireAuth()`, `isAuthError()`)

### Root Files
- `middleware.ts` - Clerk middleware for route protection

### Types (types/)
- `budget.ts` - All TypeScript interfaces (Budget, BudgetItem, Transaction, etc.)

## Important Code Patterns

### API Route Authentication
All API routes follow this pattern:
```typescript
import { requireAuth, isAuthError } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if (isAuthError(authResult)) return authResult.error;
  const { userId } = authResult;

  // Use userId in queries
  const data = await db.query.budgets.findFirst({
    where: and(eq(budgets.userId, userId), eq(budgets.month, month)),
  });
}
```

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
- All colors use semantic CSS tokens defined in `globals.css` — see `DESIGN_SYSTEM.md`
- Income/positive: `text-success`
- Expense/negative: `text-danger`
- Neutral: `text-text-primary`
- Over budget: `text-danger`
- Under budget: `text-success`
- Primary actions: `bg-primary` / `hover:bg-primary-hover`

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
- **User authentication** via Clerk (sign-in, sign-up, sign-out)
- **Multi-user support** - each user sees only their own data
- **Interactive onboarding** - 6-step guided setup for new users
- Full budget CRUD with categories and items
- **Custom budget categories** — user-created categories with name + emoji, deletable, carry over on copy
- Transaction management (add, edit, soft delete, restore)
- Split transactions across multiple budget items
- **Edit existing splits** by clicking split transactions (from Item Detail, Tracked tab, or BudgetSection dropdown)
- Bank integration via Teller
- Recurring payments with linking to budget items
- **Recurring payment auto-reset** — due dates auto-advance and funded amounts reset when period passes
- Budget item detail view in sidebar
- Monthly report with Buffer Flow (including "Left to Budget") and empty-state handling
- Copy budget from previous month (including custom categories)
- **Insights charts** — Budget vs Actual (bar), Spending Trends (line), Cash Flow (Sankey)
- **Accounts grouped by institution** on settings page

### Potential Future Work
- Could add ability to edit recurring payment from budget item detail view
- Cross-chart filtering (click category to filter all charts)
- Export charts as PNG/SVG
- Custom date range selector for trends (6 months, 1 year)

## Development Commands

```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to Supabase PostgreSQL
npm run db:studio    # Open Drizzle Studio to view/edit data
npm run build        # Production build
npm run cap:sync     # Sync Capacitor
npm run cap:ios      # Build + open Xcode
npm run cap:android  # Build + open Android Studio
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

## Common Issues & Solutions (Auth)

### Clock Skew Error
- Clerk JWT validation fails if system clock is off by more than a few seconds
- Fix: Sync system clock (Windows: Settings > Time > Sync now)
- Error message: "JWT cannot be used prior to not before date claim (nbf)"

### Redirect Loop After Sign-in
- Usually caused by clock skew (see above)
- Can also be caused by conflicting redirect props on SignIn component
- Current setup uses `fallbackRedirectUrl="/"` which respects the redirect_url query param

### Claiming Existing Data
- Use `/api/auth/claim-data` POST endpoint to claim unclaimed records (userId = '')
- GET endpoint shows count of unclaimed records

## Recent Changes (v1.1.0)

### UI Overhaul
- **Font:** Switched to Outfit (Google Fonts) via `next/font/google`
- **Color system:** Emerald primary palette with semantic CSS tokens in `globals.css`, mapped to Tailwind via `@theme inline`
- **Design system:** Documented in `DESIGN_SYSTEM.md`
- **Icons:** Unified to `react-icons/fa` only (removed `react-icons/hi2`)
- **Cursor:** Global `cursor: pointer` on all interactive elements via `@layer base`
- **Sidebar tabs:** Summary/Transactions icons wrapped in circles with proper badge positioning

## Recent Changes (v1.2.0)

### Currency Formatting
- **`lib/formatCurrency.ts`:** Utility function for consistent `$x,xxx.xx` formatting
- Applied across 6+ files (BudgetHeader, BudgetSummary, BudgetSection, MonthlyReportModal, SplitTransactionModal, recurring page)

### Budget Summary Enhancements
- **Total Savings rows** added to Planned and Actual sections in BudgetSummary sidebar
- **Tighter spacing** in summary sidebar

### Progress Bar Color
- Changed budget item progress bar from faint blue (`bg-primary-light`) to green (`bg-success`)
- Over-budget items use red (`bg-danger`) with matching glow shadows

### Auth Page Theming
- **Clerk components** styled with Emerald design system via `appearance` prop
- Variables: `colorPrimary: #059669`, Outfit font, matching text/input colors
- Card styling: `shadow-xl border border-border`

### Animated Auth Background
- Diagonal repeating "BUDGET APP" text on sign-in and sign-up pages
- 45-degree rotation with oversized container (`-100%` inset) for full coverage
- **Animated:** Alternating `scroll-left` / `scroll-right` CSS keyframe animations per row
- Non-uniform pattern: varying text sizes (`text-xl`/`text-2xl`/`text-3xl`), opacities (`0.04`–`0.07`), and gaps
- Animation speeds: 240s / 280s / 320s (slow, subtle movement)
- Keyframes added to `globals.css`: `scroll-left` and `scroll-right`
- Decorative: `pointer-events-none`, `select-none`, `aria-hidden="true"`

### Split Transaction Bug Fix
- Fixed ownership verification for split transactions (parent has null `budgetItemId` after splitting)
- Both `transactions/route.ts` and `transactions/split/route.ts` now check ownership via split transaction path

## Recent Changes (v1.3.0)

### Interactive Onboarding
- **6-step guided onboarding** for new users at `/onboarding`
- Steps: Welcome → Concepts → Set Buffer → Create Budget Items → Add Transaction → Complete
- Required on first sign-up (redirect from `/` if not completed, sign-up redirects to `/onboarding`)
- Revisitable via "Getting Started" link in sidebar (FaLightbulb icon)
- Progress persisted in `user_onboarding` table — users can resume if interrupted
- Skip option available (marks `skippedAt`, redirects to dashboard)

### Onboarding Step Details
- **Step 2 (Concepts):** Explains zero-based budgeting with 3 concept cards and example budget breakdown
- **Step 4 (Items):** Suggested budget items as clickable pill badges per category (Rent $1,200, Groceries $400, etc.). Click populates name/amount fields.
- **Step 5 (Transaction):** Suggested transactions as quick-fill badges based on items created in step 4 (Weekly groceries $85.50, Gas fill-up $45, etc.)
- **Step 6 (Complete):** Summary of what was created, marks onboarding complete via API

### Onboarding API (`/api/onboarding/route.ts`)
- `GET` — Check status (completed, currentStep)
- `POST` — Initialize record for new user
- `PUT` — Update current step
- `PATCH` — Complete or skip (`{ action: 'complete' | 'skip' }`)

### Monthly Report Empty States
- **Top Spending Items:** Shows friendly message instead of empty table when no spending
- **Potential Reallocation:** Hidden entirely when `totalExpenses === 0`
- **Category Breakdown:** Adds "No spending recorded yet" note when no expenses
- **Buffer Flow:** Contextual help text for new users vs active users

### Other Changes
- `.env.example` file added for new users
- `.gitignore` updated with `!.env.example` exception
- `README.md` updated with v1.2.0 release info and setup instructions
- Migration script: `scripts/migrate-add-onboarding.ts` for existing users
- Standalone onboarding layout (no DashboardLayout) with `h-screen overflow-hidden` and scrollable content area

## Recent Changes (v1.4.0)

### Supabase Migration (Phases 1-4)
- **Database:** Migrated from SQLite (`better-sqlite3`) to Supabase PostgreSQL
- **Schema:** Converted all tables from `sqliteTable` to `pgTable` in `db/schema.ts`
  - `integer().primaryKey({ autoIncrement: true })` → `serial().primaryKey()`
  - `integer({ mode: 'timestamp' })` → `timestamp({ withTimezone: true })`
  - `integer({ mode: 'boolean' })` → `boolean()`
  - `real()` → `numeric({ precision: 10, scale: 2 })`
- **Driver:** Switched from `drizzle-orm/better-sqlite3` to `drizzle-orm/postgres-js` in `db/index.ts`
- **Dependencies:** Removed `better-sqlite3` / `@types/better-sqlite3`, added `postgres`
- **Data migration script:** `scripts/migrate-data.ts` — migrates all 7 tables in FK order with sequence resets
- **Drizzle config:** `drizzle.config.ts` updated to `dialect: 'postgresql'` with `DATABASE_URL`

### PostgreSQL Numeric Type Fixes
PostgreSQL `numeric` columns return strings, not numbers. All arithmetic operations across 10+ files updated:
- **Read pattern:** `parseFloat(String(value))` for arithmetic
- **Write pattern:** `String(value)` for DB inserts (e.g., `fundedAmount: '0'`, `amount: String(parseFloat(amount))`)
- **Affected files:** `budgetHelpers.ts`, `recurring-payments/route.ts`, `recurring-payments/contribute/route.ts`, `recurring-payments/reset/route.ts`, `transactions/split/route.ts`, `budget-items/route.ts`, `budgets/route.ts`, `budgets/copy/route.ts`, `auth/claim-data/route.ts`, `SplitTransactionModal.tsx`
- **`.returning()` migration:** Replaced SQLite `.changes` with PostgreSQL `.returning({ id: X.id }).length` in `auth/claim-data/route.ts`

### Phase 5 Skipped — Edge Functions NOT Migrated
**Decision:** Phase 5 (migrating API routes to Supabase Edge Functions) was intentionally skipped. The app continues to use Next.js API routes (`app/api/`) which connect directly to Supabase PostgreSQL via Drizzle ORM.

**Rationale:**
- Next.js API routes already work with PostgreSQL — no functional reason to migrate
- Edge Functions use Deno runtime, requiring significant code rewriting
- Teller API integration (certificates, mTLS) would need special handling in Deno
- Current architecture (Next.js API routes → PostgreSQL) works for both web and Capacitor mobile
- Skipping avoids introducing complexity with no user-facing benefit

**Architecture:** Web + Capacitor Mobile → Next.js API Routes (Vercel) → Supabase PostgreSQL

**If Edge Functions are ever needed:**
- See `MOBILE_MIGRATION_PLAN.md` Phase 5 for the full plan
- 11 route files, 26 handlers would need conversion
- Would require Supabase CLI, Deno-compatible Drizzle setup, and secrets management for Teller certs

### Capacitor Setup (Phase 6)
- **Mode:** Live server (wraps deployed Next.js URL, no static export)
- **Config:** `capacitor.config.ts` with `server.url` pointing to deployed app
- **Dependencies:** `@capacitor/core`, `@capacitor/cli`
- **Scripts:** `cap:sync`, `cap:ios`, `cap:android` added to `package.json`
- **Phase 7 deferred:** iOS/Android platform setup not yet done (`@capacitor/ios`, `@capacitor/android` not installed)

### Teller Sync Optimization
- **Problem:** Sync took ~60s for 5 transactions due to N+1 queries over network to Supabase
- **Fix:** Refactored `POST` handler in `teller/sync/route.ts` to use batch queries:
  - Single `inArray` SELECT to fetch all existing transactions by Teller IDs
  - Single batch `INSERT` for new transactions
  - Individual `UPDATE`s only for changed rows (different data per row)
- **Result:** Reduced from ~500 individual DB queries to ~3-5 batch queries

### Monthly Report Fix
- **Bug:** Saving category was being counted as an expense in Monthly Report totals
- **Fix:** Added `key !== 'saving'` filter in `MonthlyReportModal.tsx` for both current and previous month calculations

### Split Transaction Fix
- **Bug:** `e.amount.toFixed is not a function` when clicking split transactions to edit
- **Cause:** PostgreSQL `numeric` returns strings, not numbers
- **Fix:** Wrapped with `parseFloat(String(s.amount)).toFixed(2)` in `SplitTransactionModal.tsx`

### Previous Month Transactions
- **Feature:** Sidebar "New" (uncategorized) transactions tab now shows last 3 days of previous month
- **Backend:** `GET /api/teller/sync` extended to include previous month's last 3 days, adds `fromPreviousMonth` flag per transaction
- **Frontend:** `BudgetSummary.tsx` groups transactions with "Previous Month (Last 3 Days)" and "This Month" headings
- **Behavior:** Once assigned to a budget item, transactions count toward the budget item's actuals regardless of date

### Environment Variables (Supabase)
```env
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
# Supabase client not used directly (queries go through Drizzle ORM)
```

## Recent Changes (v1.5.0)

### Interactive Insights Charts
- **Dependencies:** Added `d3`, `d3-sankey`, `@types/d3`, `@types/d3-sankey`
- **Chart infrastructure:**
  - `lib/chartColors.ts` — category color mapping (`getCategoryColor`, `getCategoryLightColor`, `getCategoryEmoji`)
  - `lib/chartHelpers.ts` — data transformation utilities for all 3 chart types
  - `types/chart.ts` — TypeScript interfaces (`CategoryChartData`, `MonthlyTrendData`, `FlowNode`, `FlowLink`, `FlowData`, `TooltipData`)
  - `components/charts/ChartTooltip.tsx` — shared fixed-position tooltip
  - `components/charts/ChartEmptyState.tsx` — shared empty state with icon/title/message/action

### Budget vs Actual Chart (`components/charts/BudgetVsActualChart.tsx`)
- Horizontal grouped bar chart: planned (gray) vs actual (category color)
- Over-budget bars turn red with glow shadow
- Hover tooltips show exact amounts and over/under difference
- Uses `d3.scaleBand()` + `d3.scaleLinear()`

### Spending Trends Chart (`components/charts/SpendingTrendsChart.tsx`)
- Multi-line chart with one line per expense category
- Interactive legend: click category to toggle visibility (`visibleCategories` Set)
- Smooth curves via `d3.curveMonotoneX`
- Dot markers on data points with hover tooltips
- Requires 2+ months of data (shows empty state otherwise)

### Cash Flow Diagram (`components/charts/FlowDiagram.tsx`)
- 3-column Sankey: Sources → Categories → Budget Items
- Sources: Buffer (gray) and Income (emerald), shown when they have values
- Gradient-colored links from source color to category color
- Node hover highlights connected links, dims others to 0.15 opacity
- Detailed tooltips show constituent line items on source/category nodes
- Column headers: SOURCES / CATEGORIES / BUDGET ITEMS
- Amount labels on bars tall enough to fit text
- Uses `d3-sankey` with `.nodeId()` for string-based node identification

### Insights Page (`app/insights/page.tsx`)
- Multi-month data fetching: loads current + 2 previous months of budgets
- `budgets` array (oldest→newest) for trends, `currentBudget` for bar/flow charts
- Refresh button with loading spinner
- Max width increased from `max-w-4xl` to `max-w-6xl`
- Replaced "Coming Soon" placeholder cards with live charts

### Data Transformation Details (`lib/chartHelpers.ts`)
- `transformBudgetToCategoryData(budget)` — aggregates planned/actual per category
- `transformBudgetsToTrendData(budgets)` — time series with month/year/date per budget
- `transformBudgetToFlowData(budget)` — 3-column Sankey data:
  - Distributes income proportionally across expense categories
  - Includes `lineItems` on source and category nodes for hover detail
  - Returns empty data when no income or no expenses
- `hasTransactionData(budget)` — checks if any category has actual spending
- `hasIncomeAndExpenses(budget)` — checks for both income and expenses (flow diagram requirement)

### D3 + React Integration Pattern
- React controls: component lifecycle, DOM structure, state (tooltips, legend)
- D3 handles: scales, axes, paths, layout calculations
- `useRef` for SVG elements, `useEffect` for D3 rendering, `useMemo` for data transforms
- Responsive via `viewBox` + `preserveAspectRatio="xMidYMid meet"`

## Recent Changes (v1.7.0)

### Custom Budget Categories
- **"Add Group" button** now functional — opens modal with name input and searchable emoji picker (130+ emojis in 12 groups)
- `CategoryType` changed from fixed union to `string`; `Budget.categories` is now `Record<string, BudgetCategory>`
- Custom categories rendered dynamically: income first → defaults → custom → saving last
- Custom categories show delete button on hover (cascade deletes items + transactions)
- Custom categories carry over via "Copy from previous month" (not auto-created in new months)
- DB schema: added `emoji` (text, nullable) and `categoryOrder` (integer) columns to `budget_categories`
- New API: `POST /api/budget-categories` (create), `DELETE /api/budget-categories?id=X` (delete)
- Chart helpers/colors updated to support dynamic categories with hash-based color assignment

### Recurring Payment Auto-Reset
- In `budgets/route.ts` GET handler: checks each active recurring payment's `nextDueDate`
- If due date has passed, advances it by one frequency period (loops until future date)
- Resets `fundedAmount` to `'0'` so progress bar starts fresh
- Monthly payments already had dynamic funded amount (from current month transactions), but DB value now stays consistent

### Buffer Flow: Left to Budget
- `MonthlyReportModal.tsx` — added "Left to Budget" row: `max(0, buffer + totalPlannedIncome - allPlannedExpenses)`
- Projected buffer formula: `Underspent - Overspent + Left to Budget`

### Accounts Grouped by Institution
- `settings/page.tsx` — linked bank accounts grouped by institution name using `reduce`

### Key Files Modified
- `db/schema.ts` — emoji + categoryOrder columns
- `types/budget.ts` — CategoryType → string, Budget.categories → Record, DefaultCategoryType union, DEFAULT_CATEGORIES array
- `types/chart.ts` — string keys instead of CategoryType import
- `lib/budgetHelpers.ts` — dynamic category initialization from DB data
- `lib/chartColors.ts` — DefaultCategoryType, custom color palette, hash-based color index
- `lib/chartHelpers.ts` — dynamic category key derivation
- `app/api/budget-categories/route.ts` — NEW (POST/DELETE)
- `app/api/budgets/route.ts` — recurring auto-reset logic
- `app/api/budgets/copy/route.ts` — custom category creation in target
- `app/page.tsx` — dynamic category rendering, Add Group modal, emoji picker
- `app/settings/page.tsx` — institution grouping
- `components/BudgetSection.tsx` — stored emoji support
- `components/MonthlyReportModal.tsx` — Left to Budget + stored emoji
- `components/charts/SpendingTrendsChart.tsx` — dynamic category keys

## Recent Changes (v1.6.0)

### Tablet Responsiveness & Mobile Block Screen
- **Mobile block screen** (`components/MobileBlockScreen.tsx`) — full-screen overlay on screens < 768px telling users to use a tablet or larger device
- **DashboardLayout** — added `MobileBlockScreen`, main layout uses `hidden md:flex` (hidden < 768px)
- **Sidebar auto-collapse** — defaults to collapsed on screens < 1024px via `window.matchMedia` listener
- **Summary sidebar toggle drawer** — on tablet (md–lg), right sidebar is a floating drawer toggled by a FAB button; on lg+ it's always visible
- **Responsive padding** — insights, recurring, settings pages use `p-4 lg:p-8`

### Month/Year Selection Persistence
- Selected month/year persists across page navigations via URL search params
- Sidebar navigation links include current `?month=X&year=Y` query params

### Transaction Categorization Suggestions
- Merchant-based suggestion badges on uncategorized transactions
- Backend: `GET /api/teller/sync` returns `suggestedBudgetItemId` based on most frequent historical merchant→budgetItem pairing
- Frontend: clickable badge on each transaction for one-tap categorization

### Transaction Display Improvements
- Show all transactions regardless of date, grouped by month
- Transactions limited to ±7 days of current budget month boundaries
- Uncategorized count updates to match filtered transactions

### Monthly Report Buffer Fix
- Removed `incomeVariance` from buffer projection (planned income is adjusted on the fly)
- Removed "Current Buffer" row from Buffer Flow UI — projection is now simply `underspent - overspent`

### Split Transaction Actual Calculation Fix
- Fixed `budgetHelpers.ts` to correctly calculate split transaction actuals by checking `parentTransaction.type`
- Income splits reduce expense category actuals; expense splits increase them

### Vercel Deployment Fix
- Excluded `scripts/` directory from `tsconfig.json` to prevent build failure from old SQLite migration scripts importing `better-sqlite3`

### New Files
- `components/MobileBlockScreen.tsx` — mobile block screen component

### Key File Changes
- `components/DashboardLayout.tsx` — MobileBlockScreen + hidden md:flex
- `components/Sidebar.tsx` — auto-collapse on tablet via matchMedia
- `app/page.tsx` — summary sidebar toggle drawer for tablet
- `app/insights/page.tsx` — responsive padding
- `app/recurring/page.tsx` — responsive padding
- `app/settings/page.tsx` — responsive padding
- `components/MonthlyReportModal.tsx` — simplified buffer projection formula
- `lib/budgetHelpers.ts` — split transaction actual calculation fix
- `app/api/teller/sync/route.ts` — merchant-based suggestions
- `tsconfig.json` — exclude scripts directory

## Recent Changes (v1.8.0)

### Empty Budget Detection Fix
- **Problem:** Recurring payment items were auto-created in GET `/api/budgets`, so new months never showed the "Hey there, looks like you need a budget" empty state
- **Fix:** Moved recurring item creation from GET `/api/budgets` to POST `/api/budgets/copy`
- Recurring due-date auto-advance still happens on GET (to keep dates current)
- Recurring budget items now only created when user clicks "Start Planning for [month]"

### Copy Budget: No More Duplicate Recurring Items
- When copying from previous month, items linked to recurring payments (`recurringPaymentId`) are skipped
- The recurring sync that runs after copying creates them fresh with proper linking
- Prevents duplicate items (e.g., "Rent" appearing twice — once from copy, once from recurring)

### Reset Budget Feature
- **New button:** "Reset Budget" below "Add Group" (dotted red border)
- **Modal:** Two-step flow with confirmation
  1. Choose: "Zero out all planned amounts" or "Replace with last month's budget"
  2. Confirm: Shows description of action with Back/Confirm buttons
- **Zero out:** Sets all planned amounts to $0.00, keeps categories/items/transactions
- **Replace:** Deletes current items, copies from previous month + syncs recurring payments

### New Files
- `app/api/budgets/reset/route.ts` — POST endpoint for budget reset (modes: 'zero', 'replace')

### Key File Changes
- `app/api/budgets/route.ts` — removed recurring item creation, kept due-date auto-advance
- `app/api/budgets/copy/route.ts` — added recurring item sync, skip items with `recurringPaymentId` during copy
- `app/page.tsx` — added Reset Budget button + modal with two-step confirmation

## Recent Changes (v1.9.0)

### Native iOS App (SwiftUI)
- **New iOS app** in `ios/BudgetApp/` — full SwiftUI implementation targeting iOS 17+
- **MVVM architecture** with ViewModels for each major view
- **Clerk iOS SDK** integration for authentication
- **Tab-based navigation:** Budget, Transactions, Accounts, Insights
- **Full budget viewing** with categories, items, and transactions
- **Month/year picker** for navigating between budget periods

### Key Fixes During Development
1. **Auth token timing race condition** — Added `isAuthReady` state to ensure token is set before API calls
2. **0-indexed month mismatch** — Converted iOS to use 0-indexed months to match web app's JavaScript `Date.getMonth()`
3. **Transaction date parsing** — Custom decoder for "YYYY-MM-DD" format (not full ISO8601)
4. **Actual amount calculation** — Client-side calculation from transactions matching web app's `budgetHelpers.ts` logic
5. **PostgreSQL numeric strings** — Custom Decimal decoding for all amount fields
6. **ISO8601 fractional seconds** — Flexible date parsing for `createdAt` and `deletedAt` timestamps

### New Files (iOS)
- `ios/BudgetApp/` — Complete Xcode project
- 28 Swift files covering Models, Services, ViewModels, and Views
- See "iOS App (SwiftUI)" section above for full structure

## Session Handoff Notes

Last session ended after:
1. Built complete native iOS app with SwiftUI
2. Fixed auth token timing, month indexing, date parsing, and actual calculations
3. App successfully loads budget data with transactions and correct spent amounts

The iOS app is functional for viewing budgets. Next steps would be adding edit/create functionality.
