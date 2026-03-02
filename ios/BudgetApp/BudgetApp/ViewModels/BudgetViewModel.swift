import Foundation
import Combine
import SwiftUI
import UIKit
import WidgetKit

@MainActor
class BudgetViewModel: ObservableObject {
    @Published var budget: Budget?
    @Published var isLoading = false
    @Published var error: String?

    // Toast state for non-blocking mutation feedback
    @Published var showToast = false
    @Published var toastMessage: String?
    @Published var isToastError = false

    // Precomputed — updated once after each load, not on every render
    @Published var sortedCategories: [BudgetCategory] = []
    @Published var incomePlanned: Decimal = 0
    @Published var incomeActual: Decimal = 0
    @Published var expensePlanned: Decimal = 0
    @Published var expenseActual: Decimal = 0

    // Uncategorized transactions for drag-to-assign tray
    @Published var uncategorizedTransactions: [Transaction] = []

    private static let defaultCategoryOrder = ["income", "giving", "household", "transportation", "food", "personal", "insurance", "saving"]

    private let budgetService = BudgetService.shared
    private let accountsService = AccountsService.shared
    private let transactionService = TransactionService.shared
    private let sharedDate = SharedDateViewModel.shared
    
    var selectedMonth: Int {
        get { sharedDate.selectedMonth }
        set { sharedDate.selectedMonth = newValue }
    }
    
    var selectedYear: Int {
        get { sharedDate.selectedYear }
        set { sharedDate.selectedYear = newValue }
    }

    // MARK: - Load Budget

    func loadBudget(skipCache: Bool = false) async {
        await loadBudgetForMonth(month: selectedMonth, year: selectedYear, skipCache: skipCache)
    }

    func loadBudgetForMonth(month: Int, year: Int, skipCache: Bool = false) async {
        error = nil

        // Update the selected month/year to match what we're loading
        selectedMonth = month
        selectedYear = year

        let cacheKey = "budget_\(month)_\(year)"

        // Load from cache first (instant, no spinner) — skip after mutations to avoid stale flash
        if !skipCache, let cached: Budget = await CacheManager.shared.load(forKey: cacheKey) {
            budget = cached
            updateComputedData()
        }

        // Only show loading spinner if no cached data
        if budget == nil {
            isLoading = true
        }

        do {
            let fresh = try await budgetService.getBudget(month: month, year: year)
            budget = fresh
            updateComputedData()
            await CacheManager.shared.save(fresh, forKey: cacheKey)
        } catch let apiError as APIError {
            #if DEBUG
            print("❌ BudgetVM load failed (APIError): \(apiError.errorDescription ?? "unknown")")
            #endif
            if budget == nil { error = apiError.errorDescription }
        } catch {
            #if DEBUG
            print("❌ BudgetVM load failed: \(error)")
            #endif
            if budget == nil { self.error = error.localizedDescription }
        }

        isLoading = false

        // Write widget data for current month only
        writeWidgetData()

        // Load uncategorized transactions for the drag-to-assign tray
        await loadUncategorizedTransactions()
    }

    // MARK: - Uncategorized Transactions (for drag-to-assign tray)

    private func loadUncategorizedTransactions() async {
        let month = selectedMonth
        let year = selectedYear

        do {
            let allUncategorized = try await accountsService.getUncategorizedTransactions(month: month, year: year)
            var filtered = filterTransactionsToDateRange(allUncategorized, month: month, year: year)

            // Remove split parents using budget data
            if let budget = budget {
                var splitParentIds = Set<Int>()
                for category in budget.categories.values {
                    for item in category.items {
                        for split in item.splitTransactions ?? [] {
                            splitParentIds.insert(split.parentTransactionId)
                        }
                    }
                }
                filtered.removeAll { splitParentIds.contains($0.id) }
            }

            uncategorizedTransactions = filtered
            writeUncategorizedWidgetData()
        } catch {
            #if DEBUG
            print("Failed to load uncategorized transactions: \(error)")
            #endif
        }
    }

    func assignTransaction(transactionId: Int, toBudgetItemId: Int) async {
        guard requireOnline() else { return }

        // Optimistic removal
        let removed = uncategorizedTransactions.first { $0.id == transactionId }
        withAnimation(.easeOut(duration: 0.3)) {
            uncategorizedTransactions.removeAll { $0.id == transactionId }
        }

        do {
            let request = UpdateTransactionRequest(id: transactionId, budgetItemId: toBudgetItemId)
            _ = try await transactionService.updateTransaction(request)
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            await loadBudget(skipCache: true)
        } catch {
            // Rollback — re-add transaction to tray
            if let removed {
                uncategorizedTransactions.append(removed)
            }
            showToast(error.localizedDescription, isError: true)
        }
    }

    // Filter transactions to ±7 days around the given month
    private func filterTransactionsToDateRange(_ transactions: [Transaction], month: Int, year: Int) -> [Transaction] {
        var utcCalendar = Calendar.current
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        var monthStartComponents = DateComponents()
        monthStartComponents.year = year
        monthStartComponents.month = month + 1 // DateComponents uses 1-indexed months
        monthStartComponents.day = 1
        guard let monthStart = utcCalendar.date(from: monthStartComponents) else {
            return transactions
        }
        guard let monthEnd = utcCalendar.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart) else {
            return transactions
        }
        guard var rangeStart = utcCalendar.date(byAdding: .day, value: -7, to: monthStart) else {
            return transactions
        }
        rangeStart = utcCalendar.startOfDay(for: rangeStart)
        guard var rangeEnd = utcCalendar.date(byAdding: .day, value: 7, to: monthEnd) else {
            return transactions
        }
        rangeEnd = utcCalendar.date(bySettingHour: 23, minute: 59, second: 59, of: rangeEnd) ?? rangeEnd

        return transactions.filter { txn in
            let txnDate = utcCalendar.startOfDay(for: txn.date)
            return txnDate >= rangeStart && txnDate <= rangeEnd
        }
    }

    // MARK: - Precomputed Data (runs once after each load, not on every render)

    private func updateComputedData() {
        guard let budget = budget else {
            sortedCategories = []
            incomePlanned = 0
            incomeActual = 0
            expensePlanned = 0
            expenseActual = 0
            return
        }
        let order = Self.defaultCategoryOrder
        sortedCategories = budget.categories.values.sorted { a, b in
            let aIdx = order.firstIndex(of: a.categoryType.lowercased()) ?? 100
            let bIdx = order.firstIndex(of: b.categoryType.lowercased()) ?? 100
            if aIdx != bIdx { return aIdx < bIdx }
            return a.order < b.order
        }

        // Single-pass aggregate computation for summary card + banner
        var iPlanned: Decimal = 0
        var iActual: Decimal = 0
        var ePlanned: Decimal = 0
        var eActual: Decimal = 0
        for cat in budget.categories.values {
            if cat.categoryType.lowercased() == "income" {
                iPlanned = cat.planned
                iActual = cat.actual
            } else {
                ePlanned += cat.planned
                eActual += cat.actual
            }
        }
        incomePlanned = iPlanned
        incomeActual = iActual
        expensePlanned = ePlanned
        expenseActual = eActual
    }

    // MARK: - Widget Data

    private func writeWidgetData() {
        guard let budget = budget else { return }

        // Only write for the current month (use local timezone so widgets
        // show the user's current month, not UTC which can be a day ahead)
        let now = Date()
        let localCal = Calendar.current
        let currentMonth = localCal.component(.month, from: now) - 1 // 0-indexed
        let currentYear = localCal.component(.year, from: now)
        guard budget.month == currentMonth && budget.year == currentYear else { return }

        // Build month label using UTC to avoid timezone shift
        let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        let monthLabel = "\(monthNames[budget.month]) \(budget.year)"

        let dailyCumulative = budget.dailyCumulativeSpending()
        let totalSpent = dailyCumulative.last ?? 0

        let widgetData = SpendingPaceData(
            monthLabel: monthLabel,
            daysInMonth: dailyCumulative.count,
            totalBudgeted: budget.totalExpensePlanned,
            totalSpent: totalSpent,
            dailyCumulative: dailyCumulative,
            lastUpdated: now
        )

        WidgetDataManager.write(widgetData)
        writeCategoryRingsData(budget: budget, monthLabel: monthLabel, now: now)
        writeBudgetOverviewData(monthLabel: monthLabel, now: now)
        writeBudgetItemRingsData(monthLabel: monthLabel, now: now)
    }

    private func writeCategoryRingsData(budget: Budget, monthLabel: String, now: Date) {
        let priorityTypes = ["household", "transportation", "food", "personal"]

        // All expense categories for the configurable single-ring widget
        let allRings: [CategoryRingItem] = sortedCategories
            .filter { $0.categoryType.lowercased() != "income" }
            .map { category in
                CategoryRingItem(
                    categoryType: category.categoryType,
                    name: category.name,
                    emoji: category.categoryEmoji,
                    planned: category.planned,
                    actual: category.actual
                )
            }

        // Priority 4 for the medium category rings widget
        let priority: [CategoryRingItem] = priorityTypes.map { type in
            if let ring = allRings.first(where: { $0.categoryType.lowercased() == type }) {
                return ring
            } else {
                let emoji = Constants.categoryEmojis[type] ?? "📁"
                return CategoryRingItem(
                    categoryType: type,
                    name: type.capitalized,
                    emoji: emoji,
                    planned: 0,
                    actual: 0
                )
            }
        }

        let data = CategoryRingsData(
            rings: allRings,
            priorityRings: priority,
            monthLabel: monthLabel,
            lastUpdated: now
        )

        WidgetDataManager.writeCategoryRings(data)
    }

    private func writeBudgetOverviewData(monthLabel: String, now: Date) {
        let data = BudgetOverviewData(
            monthLabel: monthLabel,
            incomePlanned: incomePlanned,
            incomeActual: incomeActual,
            expensePlanned: expensePlanned,
            expenseActual: expenseActual,
            lastUpdated: now
        )
        WidgetDataManager.writeBudgetOverview(data)
    }

    private func writeBudgetItemRingsData(monthLabel: String, now: Date) {
        let allItems: [BudgetItemRingItem] = sortedCategories
            .filter { $0.categoryType.lowercased() != "income" }
            .flatMap { category in
                category.items.map { item in
                    BudgetItemRingItem(
                        id: item.id,
                        name: item.name,
                        categoryName: category.name,
                        categoryEmoji: category.categoryEmoji,
                        planned: item.planned,
                        actual: item.actual
                    )
                }
            }

        let data = BudgetItemRingsData(
            items: allItems,
            monthLabel: monthLabel,
            lastUpdated: now
        )
        WidgetDataManager.writeBudgetItemRings(data)
    }

    private func writeUncategorizedWidgetData() {
        let now = Date()
        let monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

        var utcCal = Calendar(identifier: .gregorian)
        utcCal.timeZone = TimeZone(identifier: "UTC")!

        // Sort by date descending, take most recent 5
        let sorted = uncategorizedTransactions.sorted { $0.date > $1.date }
        let recent = sorted.prefix(5)

        let widgetTransactions = recent.map { transaction in
            let day = utcCal.component(.day, from: transaction.date)
            let month = utcCal.component(.month, from: transaction.date) - 1
            let dateLabel = "\(monthNames[month]) \(day)"

            return WidgetTransaction(
                id: transaction.id,
                description: transaction.merchant ?? transaction.description,
                amount: transaction.amount,
                type: transaction.type == .income ? "income" : "expense",
                date: dateLabel
            )
        }

        let transactionsData = LatestTransactionsData(
            transactions: Array(widgetTransactions),
            lastUpdated: now
        )

        WidgetDataManager.writeTransactions(transactionsData)
    }

    // MARK: - Toast Helper

    private func showToast(_ message: String, isError: Bool) {
        toastMessage = message
        isToastError = isError
        showToast = true
    }

    private func requireOnline() -> Bool {
        guard NetworkMonitor.shared.isConnected else {
            showToast("You're offline. Connect to make changes.", isError: true)
            return false
        }
        return true
    }

    // MARK: - Create Budget (for empty state)

    func createBudget() async {
        guard requireOnline() else { return }
        isLoading = true
        error = nil

        // Get previous month to copy from (0-indexed: Jan=0, Dec=11)
        var fromMonth = selectedMonth - 1
        var fromYear = selectedYear
        if fromMonth < 0 {
            fromMonth = 11
            fromYear -= 1
        }

        do {
            _ = try await budgetService.copyBudget(
                fromMonth: fromMonth,
                fromYear: fromYear,
                toMonth: selectedMonth,
                toYear: selectedYear
            )
        } catch {
            #if DEBUG
            print("Copy from previous month failed: \(error)")
            #endif
            showToast("Failed to copy from previous month", isError: true)
        }

        // Always reload to get the full budget with categories
        await loadBudget(skipCache: true)
    }

    // MARK: - Update Buffer

    func updateBuffer(_ newBuffer: Decimal) async {
        guard requireOnline() else { return }
        guard var budget = budget else { return }

        // Optimistic update
        budget.buffer = newBuffer
        self.budget = budget
        updateComputedData()

        do {
            _ = try await budgetService.updateBudget(
                BudgetUpdateRequest(id: budget.id, buffer: String(describing: newBuffer))
            )
            await loadBudget(skipCache: true)
        } catch {
            showToast(error.localizedDescription, isError: true)
            await loadBudget(skipCache: true)
        }
    }

    // MARK: - Budget Item Operations

    func createItem(categoryId: Int, name: String, planned: Decimal) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.createBudgetItem(categoryId: categoryId, name: name, planned: planned)
            await loadBudget(skipCache: true)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func updateItem(id: Int, name: String?, planned: Decimal?) async {
        guard requireOnline() else { return }

        // Optimistic update — apply change locally for instant UI feedback
        if var budget = budget {
            for catKey in budget.categories.keys {
                if let itemIndex = budget.categories[catKey]?.items.firstIndex(where: { $0.id == id }) {
                    if let name = name {
                        budget.categories[catKey]!.items[itemIndex] = {
                            var item = budget.categories[catKey]!.items[itemIndex]
                            // name is let, so rebuild
                            return BudgetItem(id: item.id, categoryId: item.categoryId, name: name, planned: item.planned, actual: item.actual, order: item.order, recurringPaymentId: item.recurringPaymentId, transactions: item.transactions, splitTransactions: item.splitTransactions)
                        }()
                    }
                    if let planned = planned {
                        budget.categories[catKey]!.items[itemIndex].planned = planned
                        // Recalculate category planned total
                        budget.categories[catKey]!.planned = budget.categories[catKey]!.items.reduce(0) { $0 + $1.planned }
                    }
                    break
                }
            }
            self.budget = budget
            updateComputedData()
        }

        do {
            _ = try await budgetService.updateBudgetItem(id: id, name: name, planned: planned)
            await loadBudget(skipCache: true)
        } catch {
            showToast(error.localizedDescription, isError: true)
            // Reload to revert optimistic update on failure
            await loadBudget(skipCache: true)
        }
    }

    func deleteItem(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.deleteBudgetItem(id: id)
            await loadBudget(skipCache: true)
            showToast("Item deleted", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func reorderItems(itemIds: [Int]) async {
        guard requireOnline() else { return }
        let reorderItems = itemIds.enumerated().map { index, id in
            ReorderItem(id: id, order: index)
        }
        do {
            _ = try await budgetService.reorderBudgetItems(items: reorderItems)
            await loadBudget(skipCache: true)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Category Operations

    func createCategory(name: String, emoji: String) async {
        guard requireOnline() else { return }
        guard let budget = budget else { return }

        do {
            _ = try await budgetService.createCategory(budgetId: budget.id, name: name, emoji: emoji)
            await loadBudget(skipCache: true)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func deleteCategory(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.deleteCategory(id: id)
            await loadBudget(skipCache: true)
            showToast("Category deleted", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Reset Budget

    func resetBudget(mode: ResetMode) async {
        guard requireOnline() else { return }
        guard let budget = budget else { return }

        isLoading = true
        do {
            _ = try await budgetService.resetBudget(budgetId: budget.id, mode: mode)
            await loadBudget(skipCache: true)
            showToast("Budget reset", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
        isLoading = false
    }
}
