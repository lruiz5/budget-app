# iOS App Changelog

All notable changes to the Budget App iOS application.

**Versioning:** Using semantic versioning (0.x.x for pre-release, 1.0.0 for first App Store release)

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
- [ ] Bank account linking via Teller
- [ ] Transaction sync from linked accounts
- [x] Custom category creation
- [x] Budget copy from previous month
- [x] Budget reset functionality
- [ ] Onboarding flow for new users
- [ ] Monthly report/insights
- [ ] Interactive charts (Budget vs Actual, Spending Trends, Cash Flow)
- [ ] Comprehensive error handling and user feedback
- [ ] Offline support with local caching
- [ ] App Store assets (screenshots, description, keywords)
- [ ] TestFlight beta testing
- [ ] Performance optimization
- [ ] Accessibility improvements (VoiceOver, Dynamic Type)

### Known Issues

- No bank account linking
- No search/filter functionality
- No onboarding flow
