# Claude Context Document

## Project Overview

Zero-based budget app: Next.js + TypeScript web app with native iOS (SwiftUI) companion. Bank integration via Teller API.

**Web App:** v1.9.0 (stable)  |  **iOS App:** v0.8.0 (pre-release)
**Last Session:** 2026-02-09

## Instructions for Claude

- **Do NOT commit** unless explicitly authorized by the user
- Wait for user approval before running `git commit`, `git push`, or similar commands

## Tech Stack

**Web:** Next.js 16.x (App Router), TypeScript, Tailwind CSS, Drizzle ORM, Supabase PostgreSQL, Clerk auth, Teller API, D3.js charts, react-icons/fa

**iOS:** Swift 5.9+, SwiftUI (iOS 17+), MVVM, Clerk iOS SDK, URLSession async/await

## Architecture

```
Web + iOS App → Next.js API Routes (Vercel) → Supabase PostgreSQL
```

Teller certs loaded via base64 env vars on Vercel, file paths locally (see `lib/teller.ts`).

## iOS App (`ios/BudgetApp/`)

```
Models/       Budget.swift, Transaction.swift, LinkedAccount.swift, RecurringPayment.swift
Services/     APIClient.swift, BudgetService, AccountsService, TransactionService, RecurringService
ViewModels/   BudgetViewModel, TransactionsViewModel, AccountsViewModel, InsightsViewModel, RecurringViewModel
Views/        Budget/, Transactions/, Accounts/, Insights/, Settings/, Onboarding/, Components/
Utilities/    Constants.swift, Extensions.swift
```

### Critical iOS Gotchas

**Month Indexing:** Web=0-indexed (JS), iOS=1-indexed (Swift). iOS converts before API calls: `month - 1`

**Auth Token Provider:** `APIClient` uses a `tokenProvider` closure (not a static token). Called before each request to get a fresh Clerk JWT (~60s expiry). Set in `BudgetAppApp.swift` via `setTokenProvider { try? await Clerk.shared.session?.getToken()?.jwt }`. Clerk SDK caches internally.

**Date Parsing:** Transaction dates="YYYY-MM-DD" (custom decoder, parsed as midnight UTC). All display formatters and Calendar grouping must use UTC timezone to avoid off-by-one day errors. Timestamps=ISO8601 with optional fractional seconds.

**Actual Calculation:** Backend returns transactions, NOT actuals. iOS calculates client-side in `BudgetItem.calculateActual(isIncomeCategory:)`. Income categories: income adds/expense subtracts. Expense categories: vice versa. Includes split transactions.

**PostgreSQL Numerics:** All amount fields decode from strings: `Decimal(string:) ?? 0`

**SwiftUI Sheets:** Use single `.sheet(item:)` with enum, NOT multiple `.sheet` modifiers (known SwiftUI bug causes stale state). See `TransactionsView.swift` `TransactionActiveSheet` enum pattern.

## Key Concepts

### Zero-Based Budgeting

Every dollar assigned: `Buffer + Income = Total Expenses` (when balanced)
Left to Budget: `buffer + incomePlanned - expensePlanned`

### Budget Structure

```
Budget (month/year) → Buffer + Categories (Income, Giving, Household, Transportation, Food, Personal, Insurance, Saving, custom...)
  → Category → Budget Items (line items) → Transactions + Split Transactions
```

## Database Schema (`db/schema.ts`)

| Table | Key Columns | Notes |
|-------|------------|-------|
| budgets | id, **userId**, month, year, buffer | Monthly containers |
| budget_categories | id, budgetId, categoryType, name, order, emoji | Includes custom cats |
| budget_items | id, categoryId, name, planned, order, **recurringPaymentId** | Line items |
| transactions | id, budgetItemId, linkedAccountId, date, description, amount, type, merchant, deletedAt | Soft delete |
| split_transactions | id, parentTransactionId, budgetItemId, amount, description | Split across items |
| recurring_payments | id, **userId**, name, amount, frequency, nextDueDate, fundedAmount, categoryType | Auto-reset on GET |
| linked_accounts | id, **userId**, tellerAccountId, accessToken, institutionName, **syncEnabled**, syncStartDate | Teller bank accounts, per-account sync toggle |
| user_onboarding | id, **userId**, currentStep, completedAt, skippedAt | Onboarding progress |

**User isolation:** `budgets`, `linked_accounts`, `recurring_payments` have userId. Children inherit via FK.

## Web App Key Files

**Pages:** `page.tsx` (budget), `recurring/page.tsx`, `settings/page.tsx`, `insights/page.tsx`, `onboarding/page.tsx`, `sign-in/`, `sign-up/`

**Components:** `BudgetSection.tsx` (category+items), `BudgetSummary.tsx` (sidebar), `MonthlyReportModal.tsx`, `DashboardLayout.tsx`, `Sidebar.tsx`, `AddTransactionModal.tsx`, `SplitTransactionModal.tsx`, `MobileBlockScreen.tsx`, `onboarding/*.tsx`, `charts/*.tsx`

**API Routes:** `budgets/` (GET auto-creates), `budget-categories/`, `transactions/`, `transactions/split/`, `recurring-payments/`, `teller/`, `onboarding/`, `budgets/copy/`, `budgets/reset/`, `auth/claim-data/`

**Utilities:** `lib/budgetHelpers.ts`, `lib/teller.ts`, `lib/auth.ts`, `lib/formatCurrency.ts`, `lib/chartColors.ts`, `lib/chartHelpers.ts`

## Important Code Patterns

### API Route Auth

```typescript
const authResult = await requireAuth();
if (isAuthError(authResult)) return authResult.error;
const { userId } = authResult;
```

### Recurring Payment Lifecycle

- Budget items link via `recurringPaymentId`
- Auto-reset: GET `/api/budgets` advances past-due `nextDueDate`, resets `fundedAmount`
- Auto-create: POST `/api/budgets/copy` creates items for active recurring payments
- Delete: must unlink budget items FIRST (`set({ recurringPaymentId: null })`), then delete

### PostgreSQL Numeric Patterns (Web)

- **Read:** `parseFloat(String(value))` for arithmetic
- **Write:** `String(value)` for DB inserts

## UI Patterns

### Colors (Web)

Semantic CSS tokens in `globals.css` — see `DESIGN_SYSTEM.md`. Income=`text-success`, Expense=`text-danger`, Over budget=`text-danger`, Primary=`bg-primary`.

### Category Emojis

Income💰 Giving🤲 Household🏠 Transportation🚗 Food🍽️ Personal👤 Insurance🛡️ Saving💵 Custom=stored emoji or 📁

### iOS Budget Page

- Summary card shows Buffer (tap-to-edit) + Income/Expenses progress rings (`MiniProgressRing`)
- Sticky bottom banner: "Start planning" (gray) / "Left to Budget" (orange) / "Every dollar is assigned!" (green) / "Over budgeted" (red)
- Progress bars as dividers between items (2px, green/red Capsule)
- Category headers collapsible with chevron

## Working Features (Web)

Auth (Clerk), multi-user, onboarding (6-step), full budget CRUD, custom categories (name+emoji), transactions (add/edit/soft-delete/restore), split transactions (create+edit), bank integration (Teller), recurring payments (auto-reset, auto-create, linking), budget item detail sidebar, monthly report with Buffer Flow + Left to Budget, copy/reset budget, insights charts (D3: bar, line, Sankey), tablet responsive + mobile block, transaction categorization suggestions, month/year URL persistence, previous month transactions

## Working Features (iOS)

Auth (Clerk), budget viewing with categories/items, month navigation, transaction viewing + categorization + editing, transaction creation (from item detail or transactions tab), budget item detail (progress ring, edit name/planned, view/add/edit transactions), bank account linking (Teller Connect via WKWebView), transaction sync from linked accounts, per-account sync toggle (half-sheet with streaming on/off), accounts viewing with institution grouping + unlink + institution icons, pull-to-refresh, sticky "Left to Budget" banner, budget summary progress rings (income/expenses), progress bar dividers, split transactions (create from item detail), recurring payment management (CRUD, contribute, mark as paid/reset, category picker), custom category creation (name+emoji picker, long-press delete), budget copy from previous month, budget reset (zero out / replace with previous month), monthly report sheet (7 sections with trends), insights charts (budget vs actual bars, spending pace burn-down, daily spending heatmap, spending trends), onboarding flow (6-step purely educational — no live data created)

## Common Issues

| Issue | Solution |
|-------|----------|
| Clerk clock skew | Sync system clock. Error: "JWT cannot be used prior to not before date claim" |
| Clerk redirect loop | Usually clock skew. Uses `fallbackRedirectUrl="/"` |
| Teller certs on Vercel | Use `TELLER_CERTIFICATE_BASE64` / `TELLER_PRIVATE_KEY_BASE64` env vars |
| iOS 404 on API calls | Expired Clerk token → middleware returns HTML redirect. Fixed by token provider pattern |
| iOS empty categories sheet | Multiple `.sheet` bug. Fixed with single `.sheet(item:)` enum pattern |
| PG numeric `toFixed` error | Wrap: `parseFloat(String(value)).toFixed(2)` |
| Buffer Flow wrong values | Underspent/Overspent only from expense categories (not income). Saving excluded from report totals |
| Quick Assign wrong month | Budget item IDs are per-month. Client validates suggestions against current month's items + generates own merchant→item map. Server uses name-based lookup |

## Development Commands

```bash
npm run dev          # Start dev server
npm run db:push      # Push schema to Supabase
npm run db:studio    # Drizzle Studio
npm run build        # Production build
```

## Environment Variables

See `.env.example`. Key vars: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `TELLER_*` (cert paths or base64).

## Current State & Next Steps

**Web:** v1.9.0 — stable, production-ready on Vercel

**iOS:** v0.9.0 — pre-release. 6-step onboarding flow (purely educational). See `ios/BudgetApp/CHANGELOG.md` for roadmap to v1.0.0.

**Next iOS work:**
- Comprehensive error handling
- Offline support / local caching
