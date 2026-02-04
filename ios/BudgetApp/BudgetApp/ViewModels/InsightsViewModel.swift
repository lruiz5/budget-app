import Foundation
import Combine

@MainActor
class InsightsViewModel: ObservableObject {
    @Published var budgets: [Budget] = []
    @Published var isLoading = false
    @Published var error: String?

    private let budgetService = BudgetService.shared

    var currentBudget: Budget? {
        budgets.last
    }

    // MARK: - Load Data

    func loadData() async {
        isLoading = true
        error = nil

        let now = Date()
        let calendar = Calendar.current
        let currentMonth = calendar.component(.month, from: now)
        let currentYear = calendar.component(.year, from: now)

        // Load current month + 2 previous months
        var loadedBudgets: [Budget] = []

        for offset in (-2...0) {
            var targetMonth = currentMonth + offset
            var targetYear = currentYear

            while targetMonth < 1 {
                targetMonth += 12
                targetYear -= 1
            }
            while targetMonth > 12 {
                targetMonth -= 12
                targetYear += 1
            }

            do {
                let budget = try await budgetService.getBudget(month: targetMonth, year: targetYear)
                loadedBudgets.append(budget)
            } catch {
                // Skip months without budgets
            }
        }

        budgets = loadedBudgets.sorted { ($0.year, $0.month) < ($1.year, $1.month) }
        isLoading = false
    }

    // MARK: - Chart Data Helpers

    struct CategoryChartItem {
        let category: String
        let planned: Decimal
        let actual: Decimal
    }

    func getCategoryChartData(from budget: Budget) -> [CategoryChartItem] {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .sorted { $0.order < $1.order }
            .map { category in
                CategoryChartItem(
                    category: category.name,
                    planned: category.planned,
                    actual: category.actual
                )
            }
    }

    struct TrendDataPoint: Identifiable {
        let id = UUID()
        let category: String
        let monthLabel: String
        let amount: Decimal
    }

    func getSpendingTrendData() -> [TrendDataPoint] {
        var dataPoints: [TrendDataPoint] = []

        for budget in budgets {
            let monthLabel = "\(shortMonthName(budget.month)) \(budget.year)"

            for (_, category) in budget.categories {
                if category.categoryType.lowercased() != "income" && category.categoryType.lowercased() != "saving" {
                    dataPoints.append(TrendDataPoint(
                        category: category.name,
                        monthLabel: monthLabel,
                        amount: category.actual
                    ))
                }
            }
        }

        return dataPoints
    }

    private func shortMonthName(_ month: Int) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM"
        var components = DateComponents()
        components.month = month
        if let date = Calendar.current.date(from: components) {
            return formatter.string(from: date)
        }
        return ""
    }
}
