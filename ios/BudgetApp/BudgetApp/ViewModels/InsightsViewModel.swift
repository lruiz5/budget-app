import Foundation
import Combine

@MainActor
class InsightsViewModel: ObservableObject {
    @Published var budgets: [Budget] = []
    @Published var previousBudget: Budget?
    @Published var isLoading = false
    @Published var error: String?

    private let budgetService = BudgetService.shared
    private let sharedDate = SharedDateViewModel.shared

    var currentBudget: Budget? {
        // Return the budget matching the selected month/year
        budgets.first { $0.month == sharedDate.selectedMonth && $0.year == sharedDate.selectedYear }
    }

    // MARK: - Load Data

    func loadData() async {
        error = nil

        // Use SharedDateViewModel (0-indexed months, matching API)
        let selectedMonth = sharedDate.selectedMonth
        let selectedYear = sharedDate.selectedYear

        // Calculate previous month (0-indexed)
        var prevMonth = selectedMonth - 1
        var prevYear = selectedYear
        if prevMonth < 0 {
            prevMonth = 11
            prevYear -= 1
        }

        // Load selected month + previous month + 1 more for trends (3 months total)
        let monthsToLoad = [
            (month: prevMonth - 1 < 0 ? 11 : prevMonth - 1, year: prevMonth - 1 < 0 ? prevYear - 1 : prevYear),
            (month: prevMonth, year: prevYear),
            (month: selectedMonth, year: selectedYear)
        ]

        // Load from cache first (instant, no spinner)
        var cachedBudgets: [Budget] = []
        for target in monthsToLoad {
            if let cached: Budget = await CacheManager.shared.load(forKey: "budget_\(target.month)_\(target.year)") {
                cachedBudgets.append(cached)
            }
        }
        if !cachedBudgets.isEmpty {
            budgets = cachedBudgets.sorted { ($0.year, $0.month) < ($1.year, $1.month) }
            previousBudget = budgets.first { $0.month == prevMonth && $0.year == prevYear }
        }

        // Only show loading spinner if no cached data
        if budgets.isEmpty {
            isLoading = true
        }

        // Fetch fresh data from network
        var loadedBudgets: [Budget] = []
        for target in monthsToLoad {
            do {
                let budget = try await budgetService.getBudget(month: target.month, year: target.year)
                loadedBudgets.append(budget)
                await CacheManager.shared.save(budget, forKey: "budget_\(target.month)_\(target.year)")
            } catch {
                // Skip months without budgets
            }
        }

        if !loadedBudgets.isEmpty {
            budgets = loadedBudgets.sorted { ($0.year, $0.month) < ($1.year, $1.month) }
            previousBudget = budgets.first { $0.month == prevMonth && $0.year == prevYear }
        }
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

    // MARK: - Daily Spending Helpers

    struct DailySpending: Identifiable {
        let id: Int  // day of month (1-31)
        let date: Date
        let amount: Decimal
        let cumulative: Decimal
    }

    func getDailySpending(from budget: Budget) -> [DailySpending] {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        // Build a date for day 1 of the budget month (month is 0-indexed, DateComponents needs 1-indexed)
        var startComponents = DateComponents()
        startComponents.year = budget.year
        startComponents.month = budget.month + 1
        startComponents.day = 1
        guard let monthStart = utcCalendar.date(from: startComponents) else { return [] }

        let daysInMonth = utcCalendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30

        // Flatten all expense transactions from the budget
        var spendingByDay: [Int: Decimal] = [:]
        for category in budget.categories.values {
            guard category.categoryType.lowercased() != "income" else { continue }
            for item in category.items {
                for transaction in item.transactions where !transaction.isDeleted && transaction.type == .expense {
                    let day = utcCalendar.component(.day, from: transaction.date)
                    spendingByDay[day, default: 0] += transaction.amount
                }
            }
        }

        // Build daily array with cumulative totals
        var result: [DailySpending] = []
        var cumulative: Decimal = 0
        for day in 1...daysInMonth {
            let amount = spendingByDay[day] ?? 0
            cumulative += amount
            var dayComponents = DateComponents()
            dayComponents.year = budget.year
            dayComponents.month = budget.month + 1
            dayComponents.day = day
            let date = utcCalendar.date(from: dayComponents) ?? monthStart
            result.append(DailySpending(id: day, date: date, amount: amount, cumulative: cumulative))
        }

        return result
    }

    func totalPlannedExpenses(from budget: Budget) -> Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .reduce(0) { $0 + $1.planned }
    }

    // MARK: - Drill-Down Helpers

    func getTransactionsForDay(day: Int, from budget: Budget) -> [Transaction] {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        var result: [Transaction] = []
        for category in budget.categories.values {
            guard category.categoryType.lowercased() != "income" else { continue }
            for item in category.items {
                for transaction in item.transactions
                    where !transaction.isDeleted
                        && transaction.type == .expense
                        && utcCalendar.component(.day, from: transaction.date) == day {
                    result.append(transaction)
                }
            }
        }
        return result.sorted { $0.amount > $1.amount }
    }

    // MARK: - Per-Category Spending Pace

    func getDailySpendingForCategory(from budget: Budget, categoryType: String) -> [DailySpending] {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        var startComponents = DateComponents()
        startComponents.year = budget.year
        startComponents.month = budget.month + 1
        startComponents.day = 1
        guard let monthStart = utcCalendar.date(from: startComponents) else { return [] }

        let daysInMonth = utcCalendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30

        var spendingByDay: [Int: Decimal] = [:]
        if let category = budget.categories.values.first(where: { $0.categoryType.lowercased() == categoryType.lowercased() }) {
            for item in category.items {
                for transaction in item.transactions where !transaction.isDeleted && transaction.type == .expense {
                    let day = utcCalendar.component(.day, from: transaction.date)
                    spendingByDay[day, default: 0] += transaction.amount
                }
            }
        }

        var result: [DailySpending] = []
        var cumulative: Decimal = 0
        for day in 1...daysInMonth {
            let amount = spendingByDay[day] ?? 0
            cumulative += amount
            var dayComponents = DateComponents()
            dayComponents.year = budget.year
            dayComponents.month = budget.month + 1
            dayComponents.day = day
            let date = utcCalendar.date(from: dayComponents) ?? monthStart
            result.append(DailySpending(id: day, date: date, amount: amount, cumulative: cumulative))
        }
        return result
    }

    struct OverspendRisk: Identifiable {
        var id: Int { category.id }
        let category: BudgetCategory
        let paceRatio: Double
    }

    func getOverspendRanking(from budget: Budget) -> [OverspendRisk] {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        // Determine how far through the month we are
        var startComponents = DateComponents()
        startComponents.year = budget.year
        startComponents.month = budget.month + 1
        startComponents.day = 1
        guard let monthStart = utcCalendar.date(from: startComponents) else { return [] }
        let daysInMonth = utcCalendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30

        let now = Date()
        let currentMonth = utcCalendar.component(.month, from: now) - 1  // 0-indexed
        let currentYear = utcCalendar.component(.year, from: now)
        let isCurrentMonth = budget.month == currentMonth && budget.year == currentYear

        let dayOfMonth: Int
        if isCurrentMonth {
            dayOfMonth = utcCalendar.component(.day, from: now)
        } else {
            dayOfMonth = daysInMonth  // Past month — use full month
        }

        let monthProgress = Double(dayOfMonth) / Double(daysInMonth)

        var risks: [OverspendRisk] = []
        for category in budget.categories.values {
            guard category.categoryType.lowercased() != "income" else { continue }
            guard category.planned > 0 else { continue }

            let expectedByNow = Double(truncating: category.planned as NSNumber) * monthProgress
            guard expectedByNow > 0 else { continue }
            let paceRatio = Double(truncating: category.actual as NSNumber) / expectedByNow

            risks.append(OverspendRisk(category: category, paceRatio: paceRatio))
        }

        return risks.sorted { $0.paceRatio > $1.paceRatio }.prefix(5).map { $0 }
    }

    private func shortMonthName(_ month: Int) -> String {
        // month is 0-indexed (0=Jan), DateComponents.month is 1-indexed
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM"
        var components = DateComponents()
        components.month = month + 1
        if let date = Calendar.current.date(from: components) {
            return formatter.string(from: date)
        }
        return ""
    }
}
