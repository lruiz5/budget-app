# Claude Context Document

## Project Overview

Zero-based budget app: Next.js + TypeScript web app with native iOS (SwiftUI) companion. Bank sync via **SimpleFIN Bridge** (migrated Jul 2026 after Teller shut down; **web** Teller code removed Jul 16 2026 — iOS deliberately untouched per user decision, legacy DB column names remain).

**Web App:** v1.17.0 (stable)  |  **iOS App:** v0.20.0 (pre-release) — **iOS app name: Happy Tusk**
**Last Session:** 2026-07-16

## Instructions for Claude

- **Do NOT commit** unless explicitly authorized by the user
- Wait for user approval before running `git commit`, `git push`, or similar commands

## Tech Stack

**Web:** Next.js 16.x (App Router), TypeScript, Tailwind CSS, Drizzle ORM, Supabase PostgreSQL, Clerk auth, SimpleFIN Bridge bank sync, D3.js charts, lucide-react icons (react-icons removed Jul 2026; functional emoji replaced with icons — category emojis are user data and stay)

**iOS:** Swift 5.9+, SwiftUI (iOS 17+), MVVM, Clerk iOS SDK, URLSession async/await

## Architecture

Web + iOS App → Next.js API Routes (Vercel) → Supabase PostgreSQL

SimpleFIN needs no certs or env vars — per-connection access URLs live in `linked_accounts.accessToken` (see `lib/simplefin.ts`).

## iOS App (`ios/BudgetApp/`)

```
Models/       Budget.swift, Transaction.swift, LinkedAccount.swift, RecurringPayment.swift
Services/     APIClient.swift, BudgetService, AccountsService, TransactionService, RecurringService
ViewModels/   BudgetViewModel, TransactionsViewModel, AccountsViewModel, InsightsViewModel, RecurringViewModel
Views/        Budget/, Transactions/, Accounts/, CashFlow/, Insights/, Settings/, Onboarding/, Components/
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

Budget (month/year) → Buffer + Categories (Income, Giving, Household, Transportation, Food, Personal, Insurance, Saving, custom...) → Budget Items (line items) → Transactions + Split Transactions

## Database Schema (`db/schema.ts`)

| Table | Key Columns | Notes |
|-------|------------|-------|
| budgets | id, **userId**, month, year, buffer | Monthly containers |
| budget_categories | id, budgetId, categoryType, name, order, emoji | Includes custom cats |
| budget_items | id, categoryId, name, planned, order, **expectedDay**, recurringPaymentId | Line items, expectedDay=1-31 for cash flow scheduling |
| transactions | id, budgetItemId, linkedAccountId, date, description, amount, type, merchant, **isNonEarned**, **tagCategoryType**, deletedAt | Soft delete, tag reclassifies in cash flow/spending trends only |
| split_transactions | id, parentTransactionId, budgetItemId, amount, description, **isNonEarned** | Split across items |
| recurring_payments | id, **userId**, name, amount, frequency, nextDueDate, fundedAmount, **fundingAdjustment**, categoryType | Auto-reset on GET, manual funding adjustment |
| linked_accounts | id, **userId**, **provider**, tellerAccountId, accessToken, institutionName, **syncEnabled**, syncStartDate | provider='teller'\|'simplefin'; tellerAccountId/accessToken hold the provider's account ID / access URL |
| user_onboarding | id, **userId**, currentStep, completedAt, skippedAt | Onboarding progress |

**User isolation:** `budgets`, `linked_accounts`, `recurring_payments` have userId. Children inherit via FK.

## Web App Key Files

**Pages:** `page.tsx` (budget), `cash-flow/page.tsx`, `settings/page.tsx`, `insights/page.tsx`, `onboarding/page.tsx`, `sign-in/`, `sign-up/`

**Components:** `BudgetSection.tsx` (category+items), `BudgetSummary.tsx` (sidebar), `MonthlyReportModal.tsx`, `DashboardLayout.tsx`, `Sidebar.tsx`, `MonthBanner.tsx` (past/future month indicator), `AddTransactionModal.tsx`, `SplitTransactionModal.tsx`, `MobileBlockScreen.tsx`, `onboarding/*.tsx`, `charts/*.tsx`

**API Routes:** `budgets/` (GET auto-creates), `budgets/list/` (GET read-only, no auto-create), `budget-categories/`, `transactions/`, `transactions/split/`, `recurring-payments/`, `bank/` (accounts, sync, balances — renamed from `teller/` Jul 16 2026; `teller/*` kept as re-export aliases for iOS), `simplefin/claim/` (POST Setup Token), `onboarding/`, `budgets/copy/`, `budgets/reset/`, `auth/claim-data/`

**Utilities:** `lib/budgetHelpers.ts`, `lib/simplefin.ts`, `lib/bankSync.ts` (shared sync core + lazy hourly sync), `lib/auth.ts`, `lib/formatCurrency.ts`, `lib/chartColors.ts`, `lib/chartHelpers.ts`, `lib/cn.ts` (class joiner, no tailwind-merge — don't pass conflicting utilities)

**UI Primitives (`components/ui/`, added Jul 2026):** `Button` (variants: primary/secondary/ghost/danger/dangerGhost; sizes sm/md/lg; defaults `type="button"`), `Modal` (Escape + backdrop-click close, `title` or custom `header`, optional `footer`, sizes sm–xl), `Card` (standard surface: `rounded-xl border shadow-sm`), `Input`, `Select`, `CurrencyInput` ($-prefix, hidden spinners, select-on-focus, `wrapperClassName`), `Skeleton` (pulse placeholder — page loading states are skeleton layouts shaped like the content, not spinners). **Always use these instead of hand-rolling modals/buttons/cards.** Onboarding + deprecated recurring page not yet migrated.

**Month navigation:** `MonthYearPicker` (shared year-stepper + month-grid popover panel; parent owns open state/outside-click) and `MonthNavigator` (compact `< July 2026 ▾ >` control used on Cash Flow + Insights). `BudgetHeader` uses `MonthYearPicker` on its title and hosts an `Ellipsis` overflow menu — Reset Budget lives there (via `onResetBudget` prop), not in the budget column.

## Important Code Patterns

### API Route Auth

```typescript
const authResult = await requireAuth();
if (isAuthError(authResult)) return authResult.error;
const { userId } = authResult;
```

### Cash Flow (expectedDay)

- Budget items have optional `expectedDay` (1-31) for cash flow scheduling
- Items with `expectedDay` appear in scheduled timeline, without appear as unscheduled
- Budget copy carries `expectedDay` forward to new months
- iOS: `BudgetViewModel.scheduledItems`/`unscheduledItems` precomputed in `updateComputedData()`
- iOS: `updateBudgetItem` uses explicit `clearExpectedDay: Bool` flag (not `Int??` — causes async closure corruption)
- iOS: `BudgetItemDetail.onUpdateExpectedDay` is a **synchronous** `(Int, Int) -> Void` closure. Uses `-1` sentinel to clear. Callers wrap in `Task { await ... }`. Async closures corrupt Int parameters in SwiftUI.

### Bank Sync (SimpleFIN)

- Bank connections are made on the SimpleFIN portal (beta-bridge.simplefin.org), not in-app. App claims a **single-use** Setup Token → access URL (Basic creds embedded — `lib/simplefin.ts` splits them out; `fetch` rejects creds-in-URL). History in 45-day windows; quota ≤24 req/day; one call per access URL covers all its accounts (cached per sync request)
- **SimpleFIN itself refreshes bank data only ~once/24h (MX upstream)** — syncing more often just re-reads the same snapshot; new bank transactions can lag a day or more (`balance-date` = last provider refresh)
- **Lazy hourly auto-sync** (`lib/bankSync.ts` `lazySyncIfStale`, added Jul 16 2026): GET `/api/bank/sync` auto-syncs any account with `lastSyncedAt` >1h old before returning uncategorized txns. The claim is an atomic UPDATE that bumps `lastSyncedAt` up front — concurrent requests can't double-sync, and failures retry hourly (not per-request), keeping usage within SimpleFIN's ~24 req/day. No cron: chosen over Vercel Cron (hourly needs Pro) and GitHub Actions — syncs only while the app is in use. Core sync logic lives in `syncSimplefinAccounts()`, shared with POST. **Web manual sync buttons removed Jul 16 2026** (BudgetSummary Sync + settings Sync All) — lazy sync is the only web trigger; POST `/api/bank/sync` remains for iOS manual sync. Web sync-error toasts went with the buttons; lazy-sync errors are server logs only for now. New-tab empty state shows "Last synced X ago" (BudgetSummary fetches accounts *after* the uncategorized fetch so the timestamp reflects the lazy sync that just ran)
- Routes live at `api/bank/*` (sync, accounts, balances) — SimpleFIN-only; rows with `provider='teller'` are skipped. `api/teller/*` still exists as thin re-export aliases **only because the iOS app calls those paths** — remove when iOS migrates. Connection-level `errors` from SimpleFIN (e.g. "connection needs attention") are surfaced in the sync response and shown as toasts (web only; iOS decodes `errors` but doesn't display them yet)
- **SimpleFIN txn IDs are only unique per account** → stored as `accountId:txnId` in `tellerTransactionId` (legacy column name)
- `payee` → merchant; `description` always `''` and **never overwritten on update** (= user notes); `syncStartDate` gates imports — **provider filters by posted date**, so txns that post with a date before `syncStartDate` are never returned (first-connection edge case; caught manually Jul 2026)

### Recurring Payment Lifecycle (deprecated — replaced by Cash Flow)

- Routes/views still exist but are out of navigation; budget items link via `recurringPaymentId`
- Delete: must unlink budget items FIRST (`set({ recurringPaymentId: null })`), then delete

### PostgreSQL Numeric Patterns (Web)

- **Read:** `parseFloat(String(value))` for arithmetic
- **Write:** `String(value)` for DB inserts

### Transaction Description = User Notes Only

- `description` = user-entered notes ("what was bought"); `merchant` = who. Never mirror merchant into description (fixed Jul 2026, web + iOS)
- All lists render `merchant || description`; `"Manual transaction"` filler only when both empty. POST `/api/transactions` accepts empty description
- Legacy mirrored values are hidden when the edit form opens and cleaned on next save
- Uncategorized (New tab) transactions are click-to-edit; budget item optional in edit modal (`allowUncategorized`), empty → stays uncategorized

### iOS Formatter Pattern

All `NumberFormatter`/`DateFormatter`/`ISO8601DateFormatter` instances are cached as static singletons in `Formatters` enum (`Utilities/Extensions.swift`). Never create inline formatter instances — always use `Formatters.currency`, `Formatters.yearMonthDay`, `Formatters.dateMediumUTC`, etc.

### iOS Font Pattern

**Custom font: Outfit** (web uses Outfit). Applied globally via UIKit appearance in `BudgetAppApp.init()` + root `.font(.custom("Outfit", size: 17))`. All views use `Font` extension helpers: `.outfitHeadline`, `.outfitBody`, `.outfitCaption`, `.outfit(size)`, etc. Defined in `Extensions.swift`. Never use bare `.font(.outfitHeadline)` — always use `.font(.outfitHeadline)`.

## UI Patterns

**Web colors:** `globals.css` tokens — Income=`text-success`, Expense/Over=`text-danger`, Primary=`bg-primary`
**Web sidebar:** dark rail; wordmark = gradient Wallet mark + "BudgetApp" (no image asset, built in `Sidebar.tsx`); active nav = left `bg-primary` accent bar + `bg-sidebar-hover` tint + `text-primary-border` icon (no filled pill); collapsed rail stacks mark above expand toggle
**Category emojis:** Income💰 Giving🤲 Household🏠 Transportation🚗 Food🍽️ Personal👤 Insurance🛡️ Saving💵 Custom=📁
**iOS budget page:** `ScrollView` + `LazyVStack` (not `List`) for custom card corner radii. Summary card (Buffer + `MiniProgressRing`). Bottom banner: gray/orange/green/red by allocation state. Progress bars as 2px Capsule dividers. Collapsible category headers. Custom `SwipeToDeleteRow` (DragGesture) + `BudgetItemDropDelegate` (onDrag/onDrop, handles both reorder and transaction assignment). Floating pill tray (`FloatingTransactionPill`) for drag-to-categorize uncategorized transactions.

## Working Features

**Web (v1.17.0):** Full budget CRUD, custom categories, transactions (add/edit/split/unsplit/soft-delete), bank sync (SimpleFIN) with per-account sync toggle, **cash flow timeline** (expectedDay scheduling), budget copy/reset, insights (D3 charts + Sankey, 6-month spending trends), monthly report, tag reclassification, non-earned income marking, transaction search & filters, drag-to-assign uncategorized transactions, onboarding, tablet responsive, month/year picker dropdown, live account balances, past/future month banner.

**iOS (v0.20.0 — Happy Tusk):** All web features plus: **cash flow tab** (scheduled/unscheduled timeline, buffer row, tap-to-edit items), native offline caching, transaction search/filters, per-account sync toggle, non-earned income marking, interactive chart drill-downs, toast error handling, drag-to-categorize from budget page, tag reclassification, manual funding adjustment, account balances (live from SimpleFIN), WidgetKit widgets. See `ios/BudgetApp/CHANGELOG.md`.

## Common Issues

| Issue | Solution |
|-------|----------|
| Clerk clock skew | Sync system clock. Error: "JWT cannot be used prior to not before date claim" |
| Clerk redirect loop | Usually clock skew. Uses `fallbackRedirectUrl="/"` |
| iOS 404 on API calls | Expired Clerk token → middleware returns HTML redirect. Fixed by token provider pattern |
| iOS empty categories sheet | Multiple `.sheet` bug. Fixed with single `.sheet(item:)` enum pattern |
| PG numeric `toFixed` error | Wrap: `parseFloat(String(value)).toFixed(2)` |
| Buffer Flow wrong values | Underspent/Overspent only from expense categories (not income). Saving excluded from report totals |
| Quick Assign wrong month | Budget item IDs are per-month. Client validates suggestions against current month's items + generates own merchant→item map. Server uses name-based lookup |
| Pending→posted duplicates | Providers issue new IDs when pending settles as posted (tips). Sync fuzzy-matches stale pending by merchant+date (7d) to update instead of insert, preserving categorization |
| seed-demo.ts FK error on linked_accounts | Uncategorized transactions (`budgetItemId=null`) survive budget cascade-delete and still reference `linked_accounts.id`. Fix: delete transactions per account before deleting the account. |
| iOS stale UI after mutations | Cache-first reload flashes old data. Use `loadBudget(skipCache: true)` / `loadTransactions(skipCache: true)` after mutations. Optimistic local updates for instant feedback. |
| iOS uncategorize transaction fails | `encodeIfPresent` omits nil `budgetItemId`. Use `clearBudgetItemId` flag + `encodeNil` to send explicit null. |
| Linked account delete FK error | `transactions.linkedAccountId` FK has no `onDelete` rule. DELETE route detaches transactions (`linkedAccountId=null`) before deleting the account — history preserved as manual. |
| Uncategorized txns vanish after account delete | GET `/api/bank/sync` only returns txns whose linked account still exists (returns `[]` if no accounts). Detached uncategorized txns are unreachable from the New tab. |
| Bank txns missing from app | Usually SimpleFIN staleness, not a sync bug: compare the account's `balance-date` in the SimpleFIN response with the bank app. SimpleFIN refreshes ~daily and pending txns can lag days. |

## Development Commands

```bash
npm run dev          # Start dev server
npm run db:push      # Push schema to Supabase
npm run db:studio    # Drizzle Studio
npm run build        # Production build
```

## Environment Variables

See `.env.example`. Key vars: `DATABASE_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`. SimpleFIN needs no runtime env vars (access URLs live in DB; `SIMPLEFIN_ACCESS_URL` in `.env.local` is just a backup). `TELLER_*` vars removed Jul 16 2026.

## Current State & Next Steps

**Web:** v1.17.0 — SimpleFIN bank sync migration done Jul 15 2026; **web Teller code removed Jul 16 2026** (`lib/teller.ts` deleted, routes renamed `api/teller/*` → `api/bank/*` with `teller/*` re-export aliases kept for iOS, Teller branches in sync/accounts/balances removed, TELLER_* env vars gone, privacy page + README updated to SimpleFIN). SimpleFIN connection `errors` now surfaced as toasts. **Lazy hourly auto-sync added Jul 16 2026** (see Bank Sync pattern). Web UI refresh done Jul 2026 (dark mode deliberately deferred). **Pending Vercel deployment:** SimpleFIN migration + Teller removal + lazy sync + budget items PUT try/catch

**iOS:** v0.20.0 — pre-release. Cash flow tab (buffer + tap-to-edit) + WidgetKit widgets (7 total) + deep links + Memoji. **iOS deliberately untouched in the Teller removal (user decision Jul 16 2026)** — it still calls `/api/teller/*` (served by the web aliases) and still contains `TellerConnectView`/`Constants.Teller`. Note: `POST /api/teller/accounts` (Teller Connect enrollment) no longer exists server-side, so the iOS "Connect Bank" flow is dead until it gets a SimpleFIN Setup-Token sheet (planned). See `ios/BudgetApp/CHANGELOG.md`.

**Bank sync (SimpleFIN) — LIVE:** Chase TOTAL CHECKING connected, first sync verified 2026-07-15 (`syncStartDate` 2026-07-14). Access URL backed up as `SIMPLEFIN_ACCESS_URL` in `.env.local`; claim route also accepts raw access URLs to re-register accounts (e.g. after adding Freedom Flex on the portal). Old Teller account row kept read-only, sync disabled (enforced in DB Jul 16). Duplicate $934.29 manual deposit (7/10) soft-deleted — synced copy (7/13) is canonical. Remaining: CSV/QFX import as vendor-proof fallback

**Next iOS work:**
- Replace `TellerConnectView` with a SimpleFIN Setup-Token entry sheet (POST `/api/simplefin/claim`), move endpoints to `/api/bank/*`, then delete the web `api/teller/*` aliases
- Renew Apple Developer membership ($99/yr) — required for TestFlight + App Store upload
- App Store Connect: create app record with bundle ID `com.happytusk.app`
- TestFlight beta testing
- Accessibility improvements (VoiceOver, Dynamic Type)

**App Store assets:** Done — `ios/APP_STORE_LISTING.md` (listing copy, keywords, URLs). Screenshots: `ios/screenshots/image1-6.jpg`. Privacy policy: `/privacy` (public route, no auth). Icon: `ios/BudgetApp/BudgetApp/Assets.xcassets/AppIcon.appiconset/`
