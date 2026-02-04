import Foundation
import Combine

@MainActor
class BudgetViewModel: ObservableObject {
    @Published var budget: Budget?
    @Published var isLoading = false
    @Published var error: String?

    @Published var selectedMonth: Int
    @Published var selectedYear: Int

    private let budgetService = BudgetService.shared

    init() {
        let now = Date()
        let calendar = Calendar.current
        // Web app uses 0-indexed months (January=0), so subtract 1 from Swift's 1-indexed months
        self.selectedMonth = calendar.component(.month, from: now) - 1
        self.selectedYear = calendar.component(.year, from: now)
    }

    // MARK: - Load Budget

    func loadBudget() async {
        isLoading = true
        error = nil

        do {
            budget = try await budgetService.getBudget(month: selectedMonth, year: selectedYear)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Create Budget (for empty state)

    func createBudget() async {
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
            budget = try await budgetService.copyBudget(
                fromMonth: fromMonth,
                fromYear: fromYear,
                toMonth: selectedMonth,
                toYear: selectedYear
            )
        } catch {
            // If copy fails (no previous budget), just reload to get the new empty budget
            await loadBudget()
        }

        isLoading = false
    }

    // MARK: - Update Buffer

    func updateBuffer(_ newBuffer: Decimal) async {
        guard let budget = budget else { return }

        do {
            self.budget = try await budgetService.updateBudget(
                BudgetUpdateRequest(id: budget.id, buffer: String(describing: newBuffer))
            )
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Budget Item Operations

    func createItem(categoryId: Int, name: String, planned: Decimal) async {
        do {
            _ = try await budgetService.createBudgetItem(categoryId: categoryId, name: name, planned: planned)
            await loadBudget()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func updateItem(id: Int, name: String?, planned: Decimal?) async {
        do {
            _ = try await budgetService.updateBudgetItem(id: id, name: name, planned: planned)
            await loadBudget()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func deleteItem(id: Int) async {
        do {
            _ = try await budgetService.deleteBudgetItem(id: id)
            await loadBudget()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Category Operations

    func createCategory(name: String, emoji: String) async {
        guard let budget = budget else { return }

        do {
            _ = try await budgetService.createCategory(budgetId: budget.id, name: name, emoji: emoji)
            await loadBudget()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func deleteCategory(id: Int) async {
        do {
            _ = try await budgetService.deleteCategory(id: id)
            await loadBudget()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Reset Budget

    func resetBudget(mode: ResetMode) async {
        guard let budget = budget else { return }

        isLoading = true
        do {
            _ = try await budgetService.resetBudget(budgetId: budget.id, mode: mode)
            await loadBudget()
        } catch {
            self.error = error.localizedDescription
        }
        isLoading = false
    }
}
