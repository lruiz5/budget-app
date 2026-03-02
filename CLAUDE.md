# Claude Context Document

## Project Overview

Zero-based budget app: Next.js + TypeScript web app with native iOS (SwiftUI) companion. Bank integration via Teller API.

**Web App:** v1.13.0 (stable)  |  **iOS App:** v0.17.0 (pre-release) — **iOS app name: Happy Tusk**
**Last Session:** 2026-03-01

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
| transactions | id, budgetItemId, linkedAccountId, date, description, amount, type, merchant, **isNonEarned**, **tagCategoryType**, deletedAt | Soft delete, tag reclassifies in cash flow/spending trends only |
| split_transactions | id, parentTransactionId, budgetItemId, amount, description, **isNonEarned** | Split across items |
| recurring_payments | id, **userId**, name, amount, frequency, nextDueDate, fundedAmount, **fundingAdjustment**, categoryType | Auto-reset on GET, manual funding adjustment |
| linked_accounts | id, **userId**, tellerAccountId, accessToken, institutionName, **syncEnabled**, syncStartDate | Teller bank accounts, per-account sync toggle |
| user_onboarding | id, **userId**, currentStep, completedAt, skippedAt | Onboarding progress |

**User isolation:** `budgets`, `linked_accounts`, `recurring_payments` have userId. Children inherit via FK.

## Web App Key Files

**Pages:** `page.tsx` (budget), `recurring/page.tsx`, `settings/page.tsx`, `insights/page.tsx`, `onboarding/page.tsx`, `sign-in/`, `sign-up/`

**Components:** `BudgetSection.tsx` (category+items), `BudgetSummary.tsx` (sidebar), `MonthlyReportModal.tsx`, `DashboardLayout.tsx`, `Sidebar.tsx`, `MonthBanner.tsx` (past/future month indicator), `AddTransactionModal.tsx`, `SplitTransactionModal.tsx`, `MobileBlockScreen.tsx`, `onboarding/*.tsx`, `charts/*.tsx`

**API Routes:** `budgets/` (GET auto-creates), `budget-categories/`, `transactions/`, `transactions/split/`, `recurring-payments/`, `teller/` (accounts, sync, balances), `onboarding/`, `budgets/copy/`, `budgets/reset/`, `auth/claim-data/`

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
- Funding calculated dynamically from linked transactions (monthly=current month only, non-monthly=cumulative)
- `fundingAdjustment` offset corrects calculated amount (e.g., after backlogging historical transactions)

### PostgreSQL Numeric Patterns (Web)

- **Read:** `parseFloat(String(value))` for arithmetic
- **Write:** `String(value)` for DB inserts

### iOS Formatter Pattern

All `NumberFormatter`/`DateFormatter`/`ISO8601DateFormatter` instances are cached as static singletons in `Formatters` enum (`Utilities/Extensions.swift`). Never create inline formatter instances — always use `Formatters.currency`, `Formatters.yearMonthDay`, `Formatters.dateMediumUTC`, etc.

### iOS Font Pattern

**Custom font: Outfit** (web uses Outfit). Applied globally via UIKit appearance in `BudgetAppApp.init()` + root `.font(.custom("Outfit", size: 17))`. All views use `Font` extension helpers: `.outfitHeadline`, `.outfitBody`, `.outfitCaption`, `.outfit(size)`, etc. Defined in `Extensions.swift`. Never use bare `.font(.outfitHeadline)` — always use `.font(.outfitHeadline)`.

## UI Patterns

**Web colors:** `globals.css` tokens — Income=`text-success`, Expense/Over=`text-danger`, Primary=`bg-primary`
**Category emojis:** Income💰 Giving🤲 Household🏠 Transportation🚗 Food🍽️ Personal👤 Insurance🛡️ Saving💵 Custom=📁
**iOS budget page:** `ScrollView` + `LazyVStack` (not `List`) for custom card corner radii. Summary card (Buffer + `MiniProgressRing`). Bottom banner: gray/orange/green/red by allocation state. Progress bars as 2px Capsule dividers. Collapsible category headers. Custom `SwipeToDeleteRow` (DragGesture) + `BudgetItemDropDelegate` (onDrag/onDrop, handles both reorder and transaction assignment). Floating pill tray (`FloatingTransactionPill`) for drag-to-categorize uncategorized transactions.

## Working Features

**Web (v1.13.0):** Feature-complete. Full budget CRUD, custom categories, transactions (add/edit/split/soft-delete), bank sync (Teller) with per-account sync toggle, recurring payments (with manual funding adjustment), budget copy/reset, insights (D3 charts + Sankey), monthly report, tag reclassification, non-earned income marking, transaction search & filters, drag-to-assign uncategorized transactions, onboarding, tablet responsive, month/year picker dropdown, live account balances, past/future month banner.

**iOS (v0.17.0 — Happy Tusk):** Feature-complete. All web features plus: native offline caching, transaction search/filters, per-account sync toggle, non-earned income marking, interactive chart drill-downs, toast error handling, drag-to-categorize from budget page, tag reclassification, manual funding adjustment, account balances (live from Teller). See `ios/BudgetApp/CHANGELOG.md`.

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
| Teller pending→posted duplicates | Teller issues new IDs when pending settles as posted (tips). Sync fuzzy-matches stale pending by merchant+date (7d) to update instead of insert, preserving categorization |
| seed-demo.ts FK error on linked_accounts | Uncategorized transactions (`budgetItemId=null`) survive budget cascade-delete and still reference `linked_accounts.id`. Fix: delete transactions per account before deleting the account. |
| iOS stale UI after mutations | Cache-first reload flashes old data. Use `loadBudget(skipCache: true)` / `loadTransactions(skipCache: true)` after mutations. Optimistic local updates for instant feedback. |
| iOS uncategorize transaction fails | `encodeIfPresent` omits nil `budgetItemId`. Use `clearBudgetItemId` flag + `encodeNil` to send explicit null. |

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

**Web:** v1.13.0 — stable, production-ready on Vercel

**iOS:** v0.17.0 — pre-release. WidgetKit widgets: 3 medium (Spending Pace chart, Uncategorized Transactions, Category Rings) + 3 small (Spending Pace arc, Single Category Ring w/ AppIntent config, Budget Overview nested rings). Manual funding adjustment, tag reclassification, custom Outfit font, tap-to-categorize, split from categorize/edit sheets. See `ios/BudgetApp/CHANGELOG.md` for roadmap to v1.0.0.

**Pending migrations:** Run in Supabase SQL Editor, then `db:push` to confirm no drift:
- `ALTER TABLE transactions ADD COLUMN tag_category_type text;`
- `ALTER TABLE recurring_payments ADD COLUMN funding_adjustment numeric(10,2) NOT NULL DEFAULT '0';`

**Next iOS work:**
- Renew Apple Developer membership ($99/yr) — required for TestFlight + App Store upload
- App Store Connect: create app record with bundle ID `com.happytusk.app`
- TestFlight beta testing
- Accessibility improvements (VoiceOver, Dynamic Type)

**App Store assets:** Done — `ios/APP_STORE_LISTING.md` (listing copy, keywords, URLs). Screenshots: `ios/screenshots/image1-6.jpg`. Privacy policy: `/privacy` (public route, no auth). Icon: `ios/BudgetApp/BudgetApp/Assets.xcassets/AppIcon.appiconset/`
