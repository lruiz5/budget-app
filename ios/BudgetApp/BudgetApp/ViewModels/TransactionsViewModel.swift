import Foundation
import Combine

@MainActor
class TransactionsViewModel: ObservableObject {
    @Published var transactions: [Transaction] = []
    @Published var deletedTransactions: [Transaction] = []
    @Published var isLoading = false
    @Published var isLoadingDeleted = false
    @Published var isSyncing = false
    @Published var error: String?

    // Toast state for non-blocking feedback (replaces showSyncAlert/syncMessage)
    @Published var showToast = false
    @Published var toastMessage: String?
    @Published var isToastError = false
    
    // Keep uncategorized and categorized transactions separate
    @Published var uncategorizedTransactions: [Transaction] = []
    @Published var categorizedTransactions: [Transaction] = []

    // Data for filter sheet
    @Published var budgetCategories: [BudgetCategory] = []
    @Published var linkedAccounts: [LinkedAccount] = []

    private let transactionService = TransactionService.shared
    private let accountsService = AccountsService.shared
    private let sharedDate = SharedDateViewModel.shared
    
    var selectedMonth: Int {
        get { sharedDate.selectedMonth }
        set { sharedDate.selectedMonth = newValue }
    }
    
    var selectedYear: Int {
        get { sharedDate.selectedYear }
        set { sharedDate.selectedYear = newValue }
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

    // MARK: - Sync Transactions

    func syncAllAccounts() async {
        guard requireOnline() else { return }
        isSyncing = true
        error = nil

        do {
            let response = try await accountsService.syncTransactions()
            let updated = response.updated ?? 0
            var parts: [String] = []
            if response.synced > 0 { parts.append("\(response.synced) new") }
            if updated > 0 { parts.append("\(updated) updated") }
            let summary = parts.isEmpty ? "No new transactions" : "Synced " + parts.joined(separator: ", ")
            showToast(summary, isError: false)
            await loadTransactions()
        } catch {
            showToast("Sync failed: \(error.localizedDescription)", isError: true)
        }

        isSyncing = false
    }

    // MARK: - Load Transactions

    func loadTransactions() async {
        error = nil

        let month = selectedMonth
        let year = selectedYear

        // Load from cache first (instant, no spinner)
        if let cachedUncat: [Transaction] = await CacheManager.shared.load(forKey: "txn_uncategorized_\(month)_\(year)"),
           let cachedCat: [Transaction] = await CacheManager.shared.load(forKey: "txn_categorized_\(month)_\(year)") {
            uncategorizedTransactions = cachedUncat
            categorizedTransactions = cachedCat
            transactions = cachedUncat + cachedCat
        }
        if let cachedCategories: [BudgetCategory] = await CacheManager.shared.load(forKey: "budget_categories_\(month)_\(year)") {
            budgetCategories = cachedCategories
        }
        if let cachedAccounts: [LinkedAccount] = await CacheManager.shared.load(forKey: "linked_accounts") {
            linkedAccounts = cachedAccounts
        }

        // Only show spinner if no cached data
        if transactions.isEmpty {
            isLoading = true
        }

        do {
            // Load all uncategorized transactions from Teller sync endpoint
            let allUncategorized = try await accountsService.getUncategorizedTransactions(month: month, year: year)
            
            // Filter to ±7 days around the current month (matching web app behavior)
            uncategorizedTransactions = filterTransactionsToDateRange(allUncategorized, month: month, year: year)
            
            // Load budget to get all categorized transactions
            let budget = try await BudgetService.shared.getBudget(month: month, year: year)

            // Expose categories for filter sheet
            budgetCategories = budget.sortedCategoryKeys.compactMap { budget.categories[$0] }

            // Extract all transactions from budget items
            var categorized: [Transaction] = []
            for category in budget.categories.values {
                for item in category.items {
                    categorized.append(contentsOf: item.transactions)
                }
            }
            
            // Collect parent transaction IDs that have been split (so they don't show as uncategorized)
            var splitParentIds = Set<Int>()
            for category in budget.categories.values {
                for item in category.items {
                    for split in item.splitTransactions ?? [] {
                        splitParentIds.insert(split.parentTransactionId)
                    }
                }
            }

            // Reconstruct split parent transactions from budget data
            // (The uncategorized API excludes split parents, so we rebuild them from split transaction data)
            var splitParentMap: [Int: (parent: Transaction, splits: [SplitTransaction])] = [:]
            for category in budget.categories.values {
                for item in category.items {
                    for s in item.splitTransactions ?? [] {
                        if splitParentMap[s.parentTransactionId] == nil, let parent = s.parentTransaction {
                            splitParentMap[s.parentTransactionId] = (parent: parent, splits: [])
                        }
                        if splitParentMap[s.parentTransactionId] != nil {
                            splitParentMap[s.parentTransactionId]!.splits.append(
                                SplitTransaction(id: s.id, parentTransactionId: s.parentTransactionId, budgetItemId: s.budgetItemId, amount: s.amount, description: s.description)
                            )
                        }
                    }
                }
            }
            for (_, value) in splitParentMap {
                var parent = value.parent
                parent.splits = value.splits
                categorized.append(parent)
            }

            // Remove split parents from uncategorized (in case any slipped through)
            uncategorizedTransactions.removeAll { splitParentIds.contains($0.id) }

            // Validate and generate Quick Assign suggestions client-side
            // This prevents wrong-month categorization regardless of server response
            let validItemIds = Set(budget.categories.values.flatMap { $0.items.map { $0.id } })

            // Build merchant → itemId map from current month's categorized transactions
            var merchantToItemId: [String: Int] = [:]
            for category in budget.categories.values {
                for item in category.items {
                    for txn in item.transactions {
                        if let merchant = txn.merchant, !merchant.isEmpty {
                            merchantToItemId[merchant] = item.id
                        }
                    }
                }
            }

            // For each uncategorized transaction:
            // - Discard server suggestions that point to wrong month's items
            // - Generate client-side suggestions from current month's data
            uncategorizedTransactions = uncategorizedTransactions.map { txn in
                var modified = txn
                if let suggestedId = modified.suggestedBudgetItemId, !validItemIds.contains(suggestedId) {
                    modified.suggestedBudgetItemId = nil
                }
                if modified.suggestedBudgetItemId == nil, let merchant = modified.merchant {
                    modified.suggestedBudgetItemId = merchantToItemId[merchant]
                }
                return modified
            }

            // Filter out deleted transactions and any that are in the uncategorized list
            let uncategorizedIds = Set(uncategorizedTransactions.map { $0.id })
            categorizedTransactions = categorized.filter { !uncategorizedIds.contains($0.id) && !$0.isDeleted }
            
            // For backward compatibility, combine both lists
            transactions = uncategorizedTransactions + categorizedTransactions
            // Load linked accounts for account filter (non-blocking)
            if let accounts = try? await accountsService.getLinkedAccounts() {
                linkedAccounts = accounts
            }

            // Save processed data to cache
            await CacheManager.shared.save(uncategorizedTransactions, forKey: "txn_uncategorized_\(month)_\(year)")
            await CacheManager.shared.save(categorizedTransactions, forKey: "txn_categorized_\(month)_\(year)")
            await CacheManager.shared.save(budgetCategories, forKey: "budget_categories_\(month)_\(year)")
            await CacheManager.shared.save(linkedAccounts, forKey: "linked_accounts")
        } catch let apiError as APIError {
            if transactions.isEmpty { error = apiError.errorDescription }
        } catch {
            if transactions.isEmpty { self.error = error.localizedDescription }
        }

        isLoading = false
    }
    
    // Filter transactions to ±7 days around the given month
    private func filterTransactionsToDateRange(_ transactions: [Transaction], month: Int, year: Int) -> [Transaction] {
        let calendar = Calendar.current
        
        // Use UTC calendar since transaction dates are midnight UTC
        var utcCalendar = calendar
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        // First day of current month (month is 0-indexed)
        var monthStartComponents = DateComponents()
        monthStartComponents.year = year
        monthStartComponents.month = month + 1 // DateComponents uses 1-indexed months
        monthStartComponents.day = 1
        guard let monthStart = utcCalendar.date(from: monthStartComponents) else {
            return transactions
        }

        // Last day of current month
        guard let monthEnd = utcCalendar.date(byAdding: DateComponents(month: 1, day: -1), to: monthStart) else {
            return transactions
        }

        // 7 days before month start (start of day)
        guard var rangeStart = utcCalendar.date(byAdding: .day, value: -7, to: monthStart) else {
            return transactions
        }
        rangeStart = utcCalendar.startOfDay(for: rangeStart)

        // 7 days after month end (end of day)
        guard var rangeEnd = utcCalendar.date(byAdding: .day, value: 7, to: monthEnd) else {
            return transactions
        }
        // Set to end of day (23:59:59)
        rangeEnd = utcCalendar.date(bySettingHour: 23, minute: 59, second: 59, of: rangeEnd) ?? rangeEnd

        return transactions.filter { txn in
            let txnDate = utcCalendar.startOfDay(for: txn.date)
            return txnDate >= rangeStart && txnDate <= rangeEnd
        }
    }

    // MARK: - Load Deleted Transactions

    func loadDeletedTransactions() async {
        let month = selectedMonth
        let year = selectedYear
        let cacheKey = "txn_deleted_\(month)_\(year)"

        // Load from cache first
        if let cached: [Transaction] = await CacheManager.shared.load(forKey: cacheKey) {
            deletedTransactions = cached
        }

        if deletedTransactions.isEmpty {
            isLoadingDeleted = true
        }

        do {
            let fresh = try await transactionService.getDeletedTransactions(month: month, year: year)
            deletedTransactions = fresh
            await CacheManager.shared.save(fresh, forKey: cacheKey)
        } catch {
            if deletedTransactions.isEmpty {
                showToast("Failed to load deleted transactions", isError: true)
            }
        }

        isLoadingDeleted = false
    }

    // MARK: - Create Transaction

    func createTransaction(budgetItemId: Int, date: Date, description: String, amount: Decimal, type: TransactionType, merchant: String?) async {
        guard requireOnline() else { return }
        do {
            let request = CreateTransactionRequest(
                budgetItemId: budgetItemId,
                date: date,
                description: description,
                amount: amount,
                type: type,
                merchant: merchant
            )
            _ = try await transactionService.createTransaction(request)
            await loadTransactions()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Update Transaction

    func updateTransaction(id: Int, budgetItemId: Int?, date: Date?, description: String?, amount: Decimal?, type: TransactionType?) async {
        guard requireOnline() else { return }
        do {
            let request = UpdateTransactionRequest(
                id: id,
                budgetItemId: budgetItemId,
                date: date,
                description: description,
                amount: amount,
                type: type
            )
            _ = try await transactionService.updateTransaction(request)
            await loadTransactions()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Delete Transaction

    func deleteTransaction(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await transactionService.deleteTransaction(id: id)
            await loadTransactions()
            showToast("Transaction deleted", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Restore Transaction

    func restoreTransaction(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await transactionService.restoreTransaction(id: id)
            await loadTransactions()
            await loadDeletedTransactions()
            showToast("Transaction restored", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Quick Categorize

    func categorizeTransaction(transactionId: Int, budgetItemId: Int) async {
        await updateTransaction(id: transactionId, budgetItemId: budgetItemId, date: nil, description: nil, amount: nil, type: nil)
    }

    // MARK: - Split Transactions

    func splitTransaction(transactionId: Int, splits: [SplitInput]) async {
        guard requireOnline() else { return }
        do {
            let request = CreateSplitsRequest(parentTransactionId: transactionId, splits: splits)
            _ = try await transactionService.createSplits(request)
            await loadTransactions()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func unsplitTransaction(transactionId: Int, budgetItemId: Int? = nil) async {
        guard requireOnline() else { return }
        do {
            _ = try await transactionService.deleteSplits(parentTransactionId: transactionId, budgetItemId: budgetItemId)
            await loadTransactions()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }
}
