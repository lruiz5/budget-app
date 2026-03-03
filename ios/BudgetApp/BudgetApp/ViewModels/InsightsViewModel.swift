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

        // Load from cache first (instant, no spinner)
        if let cached: [Budget] = await CacheManager.shared.load(forKey: "budgets_all") {
            budgets = cached.sorted { ($0.year, $0.month) < ($1.year, $1.month) }
            previousBudget = budgets.first { $0.month == prevMonth && $0.year == prevYear }
            updateComputedData()
        }

        if budgets.isEmpty {
            isLoading = true
        }

        // Fetch all existing budgets in one call (read-only, no auto-create)
        do {
            let allBudgets = try await budgetService.listBudgets()
            budgets = allBudgets.sorted { ($0.year, $0.month) < ($1.year, $1.month) }
            previousBudget = budgets.first { $0.month == prevMonth && $0.year == prevYear }
            await CacheManager.shared.save(allBudgets, forKey: "budgets_all")
            updateComputedData()
        } catch {
            if budgets.isEmpty {
                self.error = error.localizedDescription
            }
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

    // MARK: - Tag Reclassification

    /// Calculate tag adjustments: tagged transactions shift their amounts from the original category to the tagged category
    private func getTagAdjustments(from budget: Budget) -> [String: Decimal] {
        var adjustments: [String: Decimal] = [:]
        for (catKey, category) in budget.categories {
            for item in category.items {
                for t in item.transactions where t.tagCategoryType != nil && t.tagCategoryType != catKey {
                    let amt: Decimal = t.type == .expense ? t.amount : -t.amount
                    adjustments[catKey, default: 0] -= amt
                    adjustments[t.tagCategoryType!, default: 0] += amt
                }
            }
        }
        return adjustments
    }

    // MARK: - Chart Data Helpers

    struct CategoryChartItem {
        let category: String
        let planned: Decimal
        let actual: Decimal
    }

    // No tag reclassification — this is a planned vs actual chart
    func getCategoryChartData(from budget: Budget) -> [CategoryChartItem] {
        return budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .sorted { $0.order < $1.order }
            .map { category in
                return CategoryChartItem(
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
            // Use short month name; add year suffix at January or when year changes
            let monthName = shortMonthName(budget.month)
            let monthLabel = budget.month == 0 ? "\(monthName) '\(String(budget.year).suffix(2))" : monthName
            let tagAdj = getTagAdjustments(from: budget)
            for (_, category) in budget.categories {
                if category.categoryType.lowercased() != "income" && category.categoryType.lowercased() != "saving" {
                    let adjustedActual = category.actual + (tagAdj[category.categoryType] ?? 0)
                    dataPoints.append(TrendDataPoint(
                        category: category.name,
                        monthLabel: monthLabel,
                        amount: adjustedActual
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
