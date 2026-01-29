# Claude Context Document

This document contains context for Claude AI to continue development on this budget app. Use this to quickly get up to speed when starting a new session.

## Project Overview

A zero-based budget tracking application built with Next.js, TypeScript, and Tailwind CSS. The app features bank account integration via Teller API for automatic transaction imports.

**Current Version:** v1.1.0
**Last Session:** 2026-01-28

## Tech Stack

- **Framework:** Next.js 16.x (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **ORM:** Drizzle ORM
- **Database:** SQLite (better-sqlite3)
- **Authentication:** Clerk (@clerk/nextjs)
- **Bank Integration:** Teller API
- **Icons:** react-icons (FaXxx from react-icons/fa only)

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
- `page.tsx` - Main budget view with all categories
- `recurring/page.tsx` - Recurring payments management
- `settings/page.tsx` - Bank account management (Teller)
- `insights/page.tsx` - Insights hub with Monthly Summary access
- `sign-in/[[...sign-in]]/page.tsx` - Clerk sign-in page
- `sign-up/[[...sign-up]]/page.tsx` - Clerk sign-up page

### Components (components/)
- `BudgetSection.tsx` - Renders a single category with its items, handles drag-drop reorder
- `BudgetSummary.tsx` - Right sidebar with Summary/Transactions tabs AND budget item detail view
- `MonthlyReportModal.tsx` - Monthly report with Buffer Flow section
- `DashboardLayout.tsx` - Main layout wrapper with sidebar
- `Sidebar.tsx` - Collapsible navigation sidebar with UserButton
- `AddTransactionModal.tsx` - Add/edit transaction modal
- `SplitTransactionModal.tsx` - Split transaction interface

### API Routes (app/api/)
- `budgets/route.ts` - GET creates/returns budget, syncs recurring payments to budget items
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
- Full budget CRUD with categories and items
- Transaction management (add, edit, soft delete, restore)
- Split transactions across multiple budget items
- **Edit existing splits** by clicking split transactions (from Item Detail, Tracked tab, or BudgetSection dropdown)
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

## Session Handoff Notes

Last session ended after:
1. Created `formatCurrency` utility and applied across codebase
2. Added Total Savings rows to BudgetSummary
3. Changed progress bar color to green
4. Themed Clerk sign-in/sign-up pages with Emerald design system
5. Added animated diagonal "Budget App" text background to auth pages
6. Fixed split transaction ownership verification bug
7. Updated CLAUDE.md and DESIGN_SYSTEM.md

The app is in a stable state with v1.2.0 changes applied.
