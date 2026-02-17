import Foundation
import Combine

@MainActor
class InsightsViewModel: ObservableObject {
    @Published var budgets: [Budget] = []
    @Published var previousBudget: Budget?
    @Published var isLoading = false
    @Published var error: String?

    // Precomputed chart data — updated once after each load, not on every render
    @Published var dailySpending: [DailySpending] = []
    @Published var categoryChartData: [CategoryChartItem] = []
    @Published var spendingTrendData: [TrendDataPoint] = []
    @Published var totalPlanned: Decimal = 0
    @Published var heatmapCells: [HeatmapCell] = []

    private let budgetService = BudgetService.shared
    private let sharedDate = SharedDateViewModel.shared

    private static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()

    var currentBudget: Budget? {
        budgets.first { $0.month == sharedDate.selectedMonth && $0.year == sharedDate.selectedYear }
    }

    // MARK: - Load Data

    func loadData() async {
        error = nil

        let selectedMonth = sharedDate.selectedMonth
        let selectedYear = sharedDate.selectedYear

        var prevMonth = selectedMonth - 1
        var prevYear = selectedYear
        if prevMonth < 0 {
            prevMonth = 11
            prevYear -= 1
        }

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
            updateComputedData()
        }

        if budgets.isEmpty {
            isLoading = true
        }

        // Fetch fresh data from network (parallel)
        let t0 = monthsToLoad[0], t1 = monthsToLoad[1], t2 = monthsToLoad[2]
        async let b0: Budget? = try? budgetService.getBudget(month: t0.month, year: t0.year)
        async let b1: Budget? = try? budgetService.getBudget(month: t1.month, year: t1.year)
        async let b2: Budget? = try? budgetService.getBudget(month: t2.month, year: t2.year)

        var loadedBudgets: [Budget] = []
        for budget in await [b0, b1, b2] {
            if let budget {
                loadedBudgets.append(budget)
                await CacheManager.shared.save(budget, forKey: "budget_\(budget.month)_\(budget.year)")
            }
        }

        if !loadedBudgets.isEmpty {
            budgets = loadedBudgets.sorted { ($0.year, $0.month) < ($1.year, $1.month) }
            previousBudget = budgets.first { $0.month == prevMonth && $0.year == prevYear }
            updateComputedData()
        }
        isLoading = false
    }

    // MARK: - Precomputed Data (runs once after each load, not on every render)

    private func updateComputedData() {
        spendingTrendData = getSpendingTrendData()
        guard let budget = currentBudget else {
            dailySpending = []
            categoryChartData = []
            totalPlanned = 0
            heatmapCells = []
            return
        }
        let daily = getDailySpending(from: budget)
        dailySpending = daily
        categoryChartData = getCategoryChartData(from: budget)
        totalPlanned = totalPlannedExpenses(from: budget)
        heatmapCells = buildHeatmapCells(dailyData: daily, budget: budget)
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
        var startComponents = DateComponents()
        startComponents.year = budget.year
        startComponents.month = budget.month + 1
        startComponents.day = 1
        guard let monthStart = Self.utcCalendar.date(from: startComponents) else { return [] }
        let daysInMonth = Self.utcCalendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30

        var spendingByDay: [Int: Decimal] = [:]
        for category in budget.categories.values {
            guard category.categoryType.lowercased() != "income" else { continue }
            for item in category.items {
                for transaction in item.transactions where !transaction.isDeleted && transaction.type == .expense {
                    let day = Self.utcCalendar.component(.day, from: transaction.date)
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
            let date = Self.utcCalendar.date(from: dayComponents) ?? monthStart
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
        var result: [Transaction] = []
        for category in budget.categories.values {
            guard category.categoryType.lowercased() != "income" else { continue }
            for item in category.items {
                for transaction in item.transactions
                    where !transaction.isDeleted
                        && transaction.type == .expense
                        && Self.utcCalendar.component(.day, from: transaction.date) == day {
                    result.append(transaction)
                }
            }
        }
        return result.sorted { $0.amount > $1.amount }
    }

    // MARK: - Per-Category Spending Pace

    func getDailySpendingForCategory(from budget: Budget, categoryType: String) -> [DailySpending] {
        var startComponents = DateComponents()
        startComponents.year = budget.year
        startComponents.month = budget.month + 1
        startComponents.day = 1
        guard let monthStart = Self.utcCalendar.date(from: startComponents) else { return [] }
        let daysInMonth = Self.utcCalendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30

        var spendingByDay: [Int: Decimal] = [:]
        if let category = budget.categories.values.first(where: { $0.categoryType.lowercased() == categoryType.lowercased() }) {
            for item in category.items {
                for transaction in item.transactions where !transaction.isDeleted && transaction.type == .expense {
                    let day = Self.utcCalendar.component(.day, from: transaction.date)
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
            let date = Self.utcCalendar.date(from: dayComponents) ?? monthStart
            result.append(DailySpending(id: day, date: date, amount: amount, cumulative: cumulative))
        }
        return result
    }

    // MARK: - Overspend Ranking

    struct OverspendRisk: Identifiable {
        var id: Int { category.id }
        let category: BudgetCategory
        let paceRatio: Double
    }

    func getOverspendRanking(from budget: Budget) -> [OverspendRisk] {
        var startComponents = DateComponents()
        startComponents.year = budget.year
        startComponents.month = budget.month + 1
        startComponents.day = 1
        guard let monthStart = Self.utcCalendar.date(from: startComponents) else { return [] }
        let daysInMonth = Self.utcCalendar.range(of: .day, in: .month, for: monthStart)?.count ?? 30

        let now = Date()
        let currentMonth = Self.utcCalendar.component(.month, from: now) - 1  // 0-indexed
        let currentYear = Self.utcCalendar.component(.year, from: now)
        let isCurrentMonth = budget.month == currentMonth && budget.year == currentYear

        let dayOfMonth: Int
        if isCurrentMonth {
            dayOfMonth = Self.utcCalendar.component(.day, from: now)
        } else {
            dayOfMonth = daysInMonth
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

    // MARK: - Heatmap Cells (built once after load, not on every render)

    struct HeatmapCell {
        let id: String
        let type: HeatmapCellType
    }

    enum HeatmapCellType {
        case header(String)
        case empty
        case day(DailySpending)
    }

    private func buildHeatmapCells(dailyData: [DailySpending], budget: Budget) -> [HeatmapCell] {
        var cells: [HeatmapCell] = []
        let weekdays = ["S", "M", "T", "W", "T", "F", "S"]
        for (i, w) in weekdays.enumerated() {
            cells.append(HeatmapCell(id: "h\(i)", type: .header(w)))
        }
        let firstWeekday = firstWeekdayOfMonth(budget)
        for i in 0..<firstWeekday {
            cells.append(HeatmapCell(id: "e\(i)", type: .empty))
        }
        for day in dailyData {
            cells.append(HeatmapCell(id: "d\(day.id)", type: .day(day)))
        }
        return cells
    }

    private func firstWeekdayOfMonth(_ budget: Budget) -> Int {
        var components = DateComponents()
        components.year = budget.year
        components.month = budget.month + 1
        components.day = 1
        guard let date = Self.utcCalendar.date(from: components) else { return 0 }
        return Self.utcCalendar.component(.weekday, from: date) - 1
    }

    // MARK: - Helpers

    private func shortMonthName(_ month: Int) -> String {
        var components = DateComponents()
        components.month = month + 1
        if let date = Calendar.current.date(from: components) {
            return Formatters.shortMonthName.string(from: date)
        }
        return ""
    }
}
