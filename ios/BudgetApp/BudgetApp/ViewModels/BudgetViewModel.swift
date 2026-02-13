import Foundation
import Combine

@MainActor
class BudgetViewModel: ObservableObject {
    @Published var budget: Budget?
    @Published var isLoading = false
    @Published var error: String?

    // Toast state for non-blocking mutation feedback
    @Published var showToast = false
    @Published var toastMessage: String?
    @Published var isToastError = false

    private let budgetService = BudgetService.shared
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

    func loadBudget() async {
        await loadBudgetForMonth(month: selectedMonth, year: selectedYear)
    }

    func loadBudgetForMonth(month: Int, year: Int) async {
        error = nil

        // Update the selected month/year to match what we're loading
        selectedMonth = month
        selectedYear = year

        // Load from cache first (instant, no spinner)
        let cacheKey = "budget_\(month)_\(year)"
        if let cached: Budget = await CacheManager.shared.load(forKey: cacheKey) {
            budget = cached
        }

        // Only show loading spinner if no cached data
        if budget == nil {
            isLoading = true
        }

        do {
            let fresh = try await budgetService.getBudget(month: month, year: year)
            budget = fresh
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
        await loadBudget()
    }

    // MARK: - Update Buffer

    func updateBuffer(_ newBuffer: Decimal) async {
        guard requireOnline() else { return }
        guard let budget = budget else { return }

        do {
            _ = try await budgetService.updateBudget(
                BudgetUpdateRequest(id: budget.id, buffer: String(describing: newBuffer))
            )
            await loadBudget()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Budget Item Operations

    func createItem(categoryId: Int, name: String, planned: Decimal) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.createBudgetItem(categoryId: categoryId, name: name, planned: planned)
            await loadBudget()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func updateItem(id: Int, name: String?, planned: Decimal?) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.updateBudgetItem(id: id, name: name, planned: planned)
            await loadBudget()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func deleteItem(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.deleteBudgetItem(id: id)
            await loadBudget()
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
            await loadBudget()
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
            await loadBudget()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    func deleteCategory(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await budgetService.deleteCategory(id: id)
            await loadBudget()
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
            await loadBudget()
            showToast("Budget reset", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
        isLoading = false
    }
}
