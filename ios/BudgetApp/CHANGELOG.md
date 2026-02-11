# iOS App Changelog

All notable changes to the Budget App iOS application.

**Versioning:** Using semantic versioning (0.x.x for pre-release, 1.0.0 for first App Store release)

---

## [0.11.0] - 2026-02-11 - Transaction Search & Filters

### Added

- **Native search bar** — `.searchable()` on Transactions tab searches merchant, description, and formatted amount in real-time across all 3 tabs (New/Tracked/Deleted)
- **Advanced filter sheet** — toolbar button opens filter form with 4 sections: transaction type (segmented All/Income/Expense), budget category (multi-select, Tracked tab only), amount range (min/max), account source (linked accounts + Manual Entry)
- **Filter chips** — active filters shown as dismissible capsule pills below the tab picker. Each chip has an "x" to clear that filter; "Clear All" link at the end
- **Smart empty state** — when filters produce zero results but the tab has data, shows "No Matching Transactions" with "Clear Filters" button instead of the default empty state
- **Budget item name on Tracked tab** — each tracked transaction row shows its assigned budget item name in smaller secondary text below the merchant/description
- **Category filter auto-clear** — category filter resets on month change since category IDs differ per month

### Files Added

- `Views/Transactions/TransactionFilterSheet.swift` — filter sheet with `TransactionTypeFilter` enum and `@Binding` state for live updates

### Files Modified

- `Views/Transactions/TransactionsView.swift` — search state, filter pipeline (`tabFilteredTransactions` → `currentTransactions`), filter chip bar, `FilterChip` component, `budgetItemNameMap` lookup, smart empty state, `.filterOptions` sheet case
- `ViewModels/TransactionsViewModel.swift` — added `budgetCategories` and `linkedAccounts` `@Published` properties, populated in `loadTransactions()`

---

## [0.10.0] - 2026-02-11 - Comprehensive Error Handling

### Added

- **Toast notifications for all mutations** — non-blocking, auto-dismissing capsule toasts with status-colored backgrounds (green for success, red for error). Applied across all 4 tabs: Budget, Transactions, Accounts, Recurring Payments
- **APIClient network error wrapping** — `URLSession` errors now wrapped as `APIError.networkError` with user-friendly "No internet connection" message instead of raw `URLError`
- **Server error message parsing** — non-2xx responses now extract `{ "error": "message" }` or `{ "message": "..." }` from JSON body, showing meaningful messages like "Budget not found" instead of generic "HTTP error (404)"
- **Success toasts** — confirmations for destructive operations: item deleted, category deleted, budget reset, transaction deleted/restored, payment deleted, marked as paid, account linked/unlinked, sync enabled/disabled, institution removed
- **Error toasts** — all mutation catch blocks show user-readable error messages via toast instead of silent failures
- **EditTransactionSheet error alert** — save, delete, and unsplit failures now show `.alert()` with error message

### Fixed

- **Budget mutation errors no longer replace budget view** — previously, mutation errors set `self.error` which triggered a full-screen error screen, hiding the entire budget. Now uses toast for mutations, keeping `self.error` only for initial load failures where full-screen error + retry is appropriate
- **Sync toast cleanup** — removed unchanged transaction count from sync summary; shows only non-zero counts ("3 new", "2 updated") with "No new transactions" fallback

### Changed

- **ToastView styling** — status-colored background at 85% opacity with white text/icon and matching color shadow (replaced grey translucent material)
- **TransactionsViewModel** — removed `showSyncAlert`/`syncMessage` properties, consolidated into unified `showToast`/`toastMessage`/`isToastError` pattern
- **APIError cases updated** — `notFound(String?)`, `serverError(Int, String?)`, `httpError(Int, String?)` now carry optional server messages; added `networkError(Error)` case
- **AccountsViewModel toggleSync error recovery** — on API failure, reloads accounts from server to revert local toggle state
- **AccountDetailSheet toggle revert** — reads `viewModel.selectedAccount` after API call to sync local toggle with server truth

### Files Modified

- `Services/APIClient.swift` — network error wrapping, server message parsing, updated APIError enum
- `ViewModels/BudgetViewModel.swift` — toast state, mutation errors use toast
- `ViewModels/TransactionsViewModel.swift` — unified toast, removed showSyncAlert/syncMessage
- `ViewModels/AccountsViewModel.swift` — toast state, toggleSync error recovery
- `ViewModels/RecurringViewModel.swift` — toast state for all mutations
- `Views/Budget/BudgetView.swift` — wired `.toast()` modifier
- `Views/Transactions/TransactionsView.swift` — replaced sync toast with unified toast
- `Views/Accounts/AccountsView.swift` — wired `.toast()`, toggle revert in AccountDetailSheet
- `Views/Settings/RecurringPaymentsView.swift` — wired `.toast()` modifier
- `Views/Transactions/EditTransactionSheet.swift` — added saveError state + `.alert()`

---

## [0.9.0] - 2026-02-10 - Onboarding Flow

### Added

- **6-step onboarding flow** for new users — Welcome → Zero-Based Concepts → Buffer Practice → Budget Items Practice → Transaction Practice → Completion
- **Purely educational** — all practice steps use local state only. No budget, transaction, or account data is created or modified. Only onboarding progress is tracked via API
- **OnboardingFlowView** — segmented progress bar, step navigation, skip button
- **OnboardingWelcomeStep** — introduces the app with feature highlights
- **OnboardingConceptsStep** — explains zero-based budgeting with concept cards and a worked example breakdown
- **OnboardingBufferStep** — practice entering a starting buffer amount
- **OnboardingItemsStep** — practice adding budget items across 7 expense categories with suggestion chips and category accordions
- **OnboardingTransactionStep** — practice logging a transaction against a created budget item
- **OnboardingCompleteStep** — summary of practiced items with "Head to your budget to set things up for real" CTA
- **OnboardingService** — API client for onboarding status tracking (GET/POST/PUT/PATCH `/api/onboarding`)
- **OnboardingViewModel** — centralized state management with static category list, local item storage, and step tracking
- **Automatic routing** — `BudgetAppApp.swift` checks onboarding status on launch; new users see onboarding, returning users go straight to budget

### Files Added

- `Views/Onboarding/OnboardingFlowView.swift`
- `Views/Onboarding/OnboardingWelcomeStep.swift`
- `Views/Onboarding/OnboardingConceptsStep.swift`
- `Views/Onboarding/OnboardingBufferStep.swift`
- `Views/Onboarding/OnboardingItemsStep.swift`
- `Views/Onboarding/OnboardingTransactionStep.swift`
- `Views/Onboarding/OnboardingCompleteStep.swift`
- `ViewModels/OnboardingViewModel.swift`
- `Services/OnboardingService.swift`

### Files Modified

- `BudgetAppApp.swift` — onboarding status check and routing

---

## [0.7.1] - 2026-02-09 - Interactive Chart Drill-Downs & Quick Assign Fix

### Added

- **Budget vs Actual drill-down** — tap any category bar to see a breakdown of all budget items with planned/actual amounts, remaining/over indicators, and progress bar dividers
- **Daily Spending heatmap drill-down** — tap any colored day cell to see all transactions for that day with merchant, description, and amount. Empty/future days are ignored
- **CategoryDrillDownSheet** — reusable sheet showing category header (planned vs actual, under/over budget) and sorted item list
- **DayDrillDownSheet** — shows total spent header with transaction count, then transaction list sorted by amount

### Fixed

- **Quick Assign cross-month bug** — "Quick Assign" swipe was categorizing transactions to wrong month's budget items (e.g., November items when viewing February). Root cause: server returned raw `budgetItemId` from historical transactions, but budget items have different IDs per month. Fixed with two layers:
  - **Client-side validation** — iOS now validates server suggestions against current month's budget item IDs, discarding any that don't belong
  - **Client-side suggestion generation** — builds merchant→itemId map from current month's categorized transactions, providing correct suggestions without relying on server
  - **Server-side fix** — API now matches merchants to item *names* historically, then resolves to current month's item IDs via budget join (requires deploy)

### Changed

- **Consolidated sheet pattern** — replaced `showMonthlyReport` boolean with `InsightsActiveSheet` enum using single `.sheet(item:)` pattern (prevents SwiftUI multi-sheet bug)
- **Budget vs Actual rows** — added chevron hint for tap affordance
- **ViewModel drill-down helper** — `getTransactionsForDay(day:from:)` collects expense transactions for a specific day across all categories (UTC calendar, filters deleted + income)

### Files Modified

- `Views/Insights/InsightsView.swift` — `InsightsActiveSheet` enum, `.sheet(item:)`, tap gestures on bars and heatmap cells
- `Views/Insights/CategoryDrillDownSheet.swift` — **new** category drill-down sheet
- `Views/Insights/DayDrillDownSheet.swift` — **new** day drill-down sheet
- `ViewModels/InsightsViewModel.swift` — added `getTransactionsForDay()` helper
- `Models/Transaction.swift` — `suggestedBudgetItemId` changed from `let` to `var` for client-side validation
- `ViewModels/TransactionsViewModel.swift` — client-side Quick Assign validation and merchant→item suggestion
- `app/api/teller/sync/route.ts` — server-side name-based merchant suggestion lookup

---

## [0.7.0] - 2026-02-09 - Monthly Report, Insights Charts

### Added

- **Monthly report sheet** — 7-section detailed breakdown (overview, income, expenses by category, budget health, buffer flow, savings, trends vs previous month)
- **Spending pace chart** — cumulative burn-down line chart with ideal pace (dashed), actual spending (teal area+line), and "Today" marker for current month
- **Daily spending heatmap** — calendar grid with color-coded cells (green→orange→red by spending intensity), weekday headers, future day styling
- **Spending trends chart** — multi-line chart showing category spending across months with point markers

### Files Modified

- `Views/Insights/InsightsView.swift` — all 4 chart sections, heatmap grid builder, color helpers
- `Views/Insights/MonthlyReportSheet.swift` — **new** 7-section monthly report
- `ViewModels/InsightsViewModel.swift` — chart data computation helpers

---

## [0.6.0] - 2026-02-09 - Bank Account Linking, Date Fix & Budget Summary Redesign

### Added

- **Bank account linking via Teller** — WKWebView wrapper (`TellerConnectView`) embeds Teller Connect JS SDK for bank enrollment. Supports sandbox/development/production environments. On success, accounts are saved via `POST /api/teller/accounts`
- **Teller Connect UI flow** — full-screen cover from Accounts tab: "Connect Bank" → Teller WebView → accounts saved → dismiss. Manual sync via toolbar button (no auto-sync)
- **Budget summary progress rings** — replaced Planned/Actual text columns with two `MiniProgressRing` components showing income and expense progress (actual vs planned). Compact 44pt circles with percentage, label, and compact dollar amount

### Fixed

- **Transaction dates off by one day** — dates parsed as midnight UTC but displayed/grouped using local timezone, causing Feb 9 to show as Feb 8 in US timezones. Fixed all `DateFormatter` and `Calendar` instances to use UTC for transaction date display and grouping
- **`LinkAccountRequest` shape mismatch** — iOS sent individual fields but API expects `{ accessToken, enrollment: { id } }`. Fixed request struct to match
- **`linkAccount()` return type** — was single `LinkedAccount` but API returns `{ accounts: [...] }` wrapper. Now uses `LinkedAccountsResponse`
- **`LinkedAccount` missing fields** — added `tellerEnrollmentId`, `institutionId`, `status`, `lastSyncedAt` to match API response

### Changed

- **Account card** — now shows account subtype (e.g., "Credit Card") and last synced time
- **No auto-sync after linking** — linking accounts no longer triggers automatic transaction sync; user controls when to sync

### Files Modified

- `Views/Accounts/TellerConnectView.swift` — **new** WKWebView wrapper for Teller Connect JS SDK
- `Views/Accounts/AccountsView.swift` — wired TellerConnectView via fullScreenCover, enhanced AccountCard
- `Models/LinkedAccount.swift` — added missing fields, improved computed properties
- `Services/AccountsService.swift` — fixed LinkAccountRequest shape, return type
- `ViewModels/AccountsViewModel.swift` — simplified linkAccount, removed auto-sync
- `Views/Budget/BudgetView.swift` — replaced summary card with MiniProgressRing, new MiniProgressRing component
- `Views/Transactions/TransactionsView.swift` — UTC timezone for date formatting and grouping
- `Views/Transactions/SplitTransactionSheet.swift` — UTC timezone for date formatting
- `Views/Budget/BudgetItemDetail.swift` — UTC timezone for date formatting
- `ViewModels/TransactionsViewModel.swift` — UTC calendar for date range filtering
- `Utilities/Constants.swift` — added Teller.environment

---

## [0.5.0] - 2026-02-09 - Custom Categories, Budget Copy/Reset & Banner Fix

### Added

- **Custom category creation** — "Add Category" button on budget page opens sheet with name field and emoji picker (12 curated groups matching web app). Default emoji: 📋
- **Custom category deletion** — long-press category header shows "Delete Category" context menu (custom categories only, not default 8)
- **Budget reset UI** — two-step sheet: choose mode (zero out planned amounts OR replace with previous month's budget), then confirm with red button. Uses existing `POST /api/budgets/reset` endpoint
- **"Start planning" banner state** — when no buffer, income, or expenses are planned, banner shows neutral "Start planning your budget" (gray) instead of misleading "Every dollar is assigned!" (green)

### Fixed

- **Budget copy field name mismatch** — `CopyBudgetRequest` sent `fromMonth/fromYear/toMonth/toYear` but API expected `sourceMonth/sourceYear/targetMonth/targetYear`, causing silent 400 errors on every copy attempt
- **Budget copy return type** — `copyBudget()` declared return type as `Budget` but API returns `{ success: true }`. Changed to `SuccessResponse`
- **`createBudget()` flow** — was trying to assign copy result to `budget` (type mismatch). Changed to `_ = try await`, always reloads via `loadBudget()`

### Files Modified

- `Views/Budget/AddCategorySheet.swift` — **new** custom category creation form with emoji picker
- `Views/Budget/ResetBudgetSheet.swift` — **new** two-step reset confirmation sheet
- `Views/Budget/BudgetView.swift` — added `.addCategory`/`.resetBudget` to sheet enum, buttons, delete confirmation dialog, `hasAnyPlanning` banner fix
- `Views/Budget/CategorySection.swift` — added `onDeleteCategory` callback, `.contextMenu` on header
- `Services/BudgetService.swift` — fixed `CopyBudgetRequest` field names, `copyBudget` return type
- `ViewModels/BudgetViewModel.swift` — fixed `createBudget()` flow

---

## [0.2.0] - 2026-02-06 - Auth Fix, Transaction Categorization & Budget UI

### Fixed

- **Auth token expiration** — API calls failed with 404 (HTML redirect) after ~60s because Clerk tokens were fetched once at launch. Replaced static `authToken` in `APIClient` with `tokenProvider` closure that fetches a fresh JWT before each request. Clerk SDK caches internally.
- **Empty categories in transaction sheets** — Multiple `.sheet` modifiers on `TransactionsView` caused a known SwiftUI bug where sheets wouldn't fire `.task` or had stale state. Consolidated into single `.sheet(item:)` with `TransactionActiveSheet` enum.
- **No error visibility in sheets** — `CategorizeTransactionSheet` and `EditTransactionSheet` silently showed empty when budget failed to load. Added error display with retry buttons.

### Added

- **"Left to Budget" sticky banner** — bottom banner on budget page shows allocation status:
  - Orange: "$X left to budget" (unassigned money)
  - Green: "Every dollar is assigned!" (balanced)
  - Red: "Over budgeted by $X" (over-allocated)
  - Formula: `buffer + incomePlanned - expensePlanned`
- **Debug logging** in `BudgetViewModel` catch blocks for easier troubleshooting

### Changed

- **Budget summary card** — removed redundant Income display (duplicated by Income category), now shows Buffer / Planned / Actual in a single row
- **Progress bar as divider** — removed default List separators between budget items, replaced with full-width 2px progress bar (green/red Capsule) acting as visual divider
- **Auth flow** — `BudgetAppApp.swift` sets token provider instead of static token; `SettingsView` sign-out no longer needs to clear token

### Files Modified

- `Services/APIClient.swift` — `tokenProvider` closure pattern
- `BudgetAppApp.swift` — `setTokenProvider` instead of `setAuthToken`
- `Views/Transactions/TransactionsView.swift` — single `.sheet(item:)` with `TransactionActiveSheet` enum, error+retry in categorize sheet
- `Views/Transactions/EditTransactionSheet.swift` — error+retry in Category section
- `Views/Budget/BudgetView.swift` — simplified summary card, `LeftToBudgetBanner` component
- `Views/Budget/CategorySection.swift` — `.listRowSeparator(.hidden)`, full-width progress bar in `BudgetItemRow`
- `Views/Settings/SettingsView.swift` — removed `setAuthToken(nil)` on sign-out
- `ViewModels/BudgetViewModel.swift` — debug logging in catch blocks

---

## [0.1.1] - 2026-02-04 - Month Navigation Fix

### Fixed

- **Month navigation bug** — budget data now updates correctly when navigating between months
  - Root cause: Multiple issues compounding:
    1. SwiftUI binding timing issue where `onChange` callback was called before binding values propagated to ViewModel
    2. URLSession caching causing stale 404 responses
    3. Non-deterministic query parameter ordering in URLs
  - Solution implemented:
    1. `MonthYearPicker` now uses local `@State` variables (`tempMonth`, `tempYear`) for picker UI, only updating bindings and calling `onChange` when "Done" is tapped
    2. Added `loadBudgetForMonth(month:year:)` method to `BudgetViewModel` that accepts explicit month/year parameters
    3. Added `.id()` modifier to `BudgetView` to force re-render when month/year changes
    4. Disabled URLSession caching with `.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData`
    5. Sorted query parameters alphabetically for consistent URL generation

### Changed

- `MonthYearPicker.onChange` signature changed from `() -> Void` to `(Int, Int) -> Void` to pass selected values directly
- `BudgetViewModel.loadBudget()` now delegates to `loadBudgetForMonth(month:year:)`
- `APIClient.get()` now sorts query parameters and disables caching
- `BudgetView` uses `.id()` modifier to force view updates on month/year changes
- Added "Cancel" button to month picker for better UX

### Files Modified

- `Views/Components/MonthYearPicker.swift` — local state pattern, Cancel button
- `ViewModels/BudgetViewModel.swift` — new `loadBudgetForMonth` method
- `Views/Budget/BudgetView.swift` — `.id()` modifier, updated callback signature
- `Services/APIClient.swift` — sorted query params, disabled caching

---

## [0.1.0] - 2026-02-04 - Initial Release

### Added

- **Complete SwiftUI implementation** targeting iOS 17+
- **MVVM architecture** with ViewModels for each major view
- **Tab-based navigation**: Budget, Transactions, Accounts, Insights
- **Full budget viewing** with categories, items, and transactions
- **Month/year picker** for navigating between budget periods
- **Clerk iOS SDK integration** for authentication
- **Settings view** with recurring payments management

### Technical Implementation

- **0-indexed month handling** — iOS converts to match web app's JavaScript `Date.getMonth()` (Jan=0)
- **Custom date parsing** — handles "YYYY-MM-DD" transaction dates and ISO8601 timestamps with fractional seconds
- **Client-side actual calculation** — calculates spent amounts from transactions, matching web app's `budgetHelpers.ts` logic
- **PostgreSQL numeric handling** — custom Decimal decoding for all amount fields returned as strings
- **Auth token timing** — `isAuthReady` state prevents API calls before Clerk token is available

### Project Structure

- **Models**: Budget, BudgetCategory, BudgetItem, Transaction, LinkedAccount, RecurringPayment
- **Services**: APIClient, BudgetService, AccountsService, TransactionService, RecurringService
- **ViewModels**: BudgetViewModel, TransactionsViewModel, AccountsViewModel, InsightsViewModel, RecurringViewModel
- **Views**: BudgetView, TransactionsView, AccountsView, InsightsView, SettingsView, and supporting components

### Key Fixes During Development

1. **Auth token timing race condition** — Added `isAuthReady` state to ensure token is set before API calls
2. **0-indexed month mismatch** — Converted iOS to use 0-indexed months to match web app
3. **Transaction date parsing** — Custom decoder for "YYYY-MM-DD" format (not full ISO8601)
4. **Actual amount calculation** — Client-side calculation from transactions matching web app logic
5. **PostgreSQL numeric strings** — Custom Decimal decoding for all amount fields
6. **ISO8601 fractional seconds** — Flexible date parsing for `createdAt` and `deletedAt` timestamps

---

## Roadmap to v1.0.0 (App Store Release)

### Planned Features

- [x] Transaction creation and editing
- [x] Budget item creation and editing
- [x] Split transaction support
- [x] Recurring payment management (create/edit/delete)
- [x] Bank account linking via Teller
- [x] Transaction sync from linked accounts
- [x] Custom category creation
- [x] Budget copy from previous month
- [x] Budget reset functionality
- [x] Onboarding flow for new users
- [x] Monthly report/insights
- [x] Interactive charts (Budget vs Actual, Daily Spending heatmap drill-downs)
- [x] Comprehensive error handling and user feedback
- [x] Transaction search & filters
- [ ] Offline support with local caching
- [ ] App Store assets (screenshots, description, keywords)
- [ ] TestFlight beta testing
- [ ] Performance optimization
- [ ] Accessibility improvements (VoiceOver, Dynamic Type)

### Known Issues

- None currently tracked
