import SwiftUI
import Charts

struct InsightsView: View {
    @StateObject private var viewModel = InsightsViewModel()
    @State private var showMonthlyReport = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                // Monthly Report Card
                monthlyReportCard

                // Budget vs Actual Chart
                if let budget = viewModel.currentBudget {
                    budgetVsActualChart(budget)
                    spendingPaceChart(budget)
                    spendingHeatmap(budget)
                }

                // Spending Trends (requires multiple months)
                if viewModel.budgets.count >= 2 {
                    spendingTrendsChart
                }
            }
            .padding()
        }
        .refreshable {
            await viewModel.loadData()
        }
        .task {
            await viewModel.loadData()
        }
        .sheet(isPresented: $showMonthlyReport) {
            if let budget = viewModel.currentBudget {
                MonthlyReportSheet(budget: budget, previousBudget: viewModel.previousBudget)
            }
        }
    }

    // MARK: - Monthly Report Card

    private var monthlyReportCard: some View {
        Button {
            showMonthlyReport = true
        } label: {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Monthly Report")
                        .font(.headline)
                        .foregroundStyle(.primary)

                    Text("View detailed breakdown")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .foregroundStyle(.secondary)
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Budget vs Actual Chart

    @ViewBuilder
    private func budgetVsActualChart(_ budget: Budget) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Budget vs Actual")
                .font(.headline)

            let categoryData = viewModel.getCategoryChartData(from: budget)

            if categoryData.isEmpty {
                Text("No spending data yet")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                let maxAmount = categoryData.map { max($0.planned, $0.actual) }.max() ?? 1

                VStack(spacing: 14) {
                    ForEach(categoryData, id: \.category) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(item.category)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Spacer()
                                Text(formatCurrency(item.actual))
                                    .font(.subheadline)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(item.actual > item.planned ? .red : .primary)
                            }

                            GeometryReader { geo in
                                ZStack(alignment: .leading) {
                                    // Planned (gray background)
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(Color(.systemGray4))
                                        .frame(width: barWidth(geo: geo, amount: item.planned, max: maxAmount))

                                    // Actual (colored overlay)
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(item.actual > item.planned ? Color.red : Color.green)
                                        .frame(width: barWidth(geo: geo, amount: item.actual, max: maxAmount))
                                }
                            }
                            .frame(height: 20)

                            HStack {
                                Text("Planned: \(formatCurrency(item.planned))")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                        }
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func barWidth(geo: GeometryProxy, amount: Decimal, max: Decimal) -> CGFloat {
        guard max > 0 else { return 0 }
        let ratio = Double(truncating: (amount / max) as NSNumber)
        return geo.size.width * min(1.0, CGFloat(ratio))
    }

    // MARK: - Spending Pace Chart

    @ViewBuilder
    private func spendingPaceChart(_ budget: Budget) -> some View {
        let dailyData = viewModel.getDailySpending(from: budget)
        let totalPlanned = viewModel.totalPlannedExpenses(from: budget)

        VStack(alignment: .leading, spacing: 12) {
            Text("Spending Pace")
                .font(.headline)

            if dailyData.allSatisfy({ $0.amount == 0 }) {
                Text("No spending data yet")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                let daysInMonth = dailyData.count

                Chart {
                    // Ideal pace line (dashed)
                    LineMark(
                        x: .value("Day", 1),
                        y: .value("Amount", 0),
                        series: .value("Series", "Ideal")
                    )
                    .foregroundStyle(.gray.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [6, 4]))

                    LineMark(
                        x: .value("Day", daysInMonth),
                        y: .value("Amount", totalPlanned),
                        series: .value("Series", "Ideal")
                    )
                    .foregroundStyle(.gray.opacity(0.5))
                    .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [6, 4]))

                    // Actual cumulative spending
                    ForEach(dailyData) { day in
                        AreaMark(
                            x: .value("Day", day.id),
                            y: .value("Amount", day.cumulative)
                        )
                        .foregroundStyle(.teal.opacity(0.15))

                        LineMark(
                            x: .value("Day", day.id),
                            y: .value("Amount", day.cumulative),
                            series: .value("Series", "Actual")
                        )
                        .foregroundStyle(.teal)
                        .lineStyle(StrokeStyle(lineWidth: 2))
                    }

                    // Today marker (only if viewing current month)
                    if isCurrentMonth(budget) {
                        let today = todayDay()
                        if today > 0 && today <= daysInMonth {
                            RuleMark(x: .value("Day", today))
                                .foregroundStyle(.orange.opacity(0.5))
                                .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                                .annotation(position: .top, alignment: .center) {
                                    Text("Today")
                                        .font(.caption2)
                                        .foregroundStyle(.orange)
                                }
                        }
                    }
                }
                .chartXAxisLabel("Day of Month")
                .chartYAxis {
                    AxisMarks(position: .leading) { value in
                        AxisValueLabel {
                            if let amount = value.as(Decimal.self) {
                                Text(formatCurrencyShort(amount))
                            }
                        }
                    }
                }
                .frame(height: 200)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func isCurrentMonth(_ budget: Budget) -> Bool {
        let now = Date()
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let currentMonth = utcCalendar.component(.month, from: now) - 1  // 0-indexed
        let currentYear = utcCalendar.component(.year, from: now)
        return budget.month == currentMonth && budget.year == currentYear
    }

    private func todayDay() -> Int {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        return utcCalendar.component(.day, from: Date())
    }

    private func formatCurrencyShort(_ value: Decimal) -> String {
        let doubleVal = Double(truncating: value as NSNumber)
        if doubleVal >= 1000 {
            return "$\(Int(doubleVal / 1000))k"
        }
        return "$\(Int(doubleVal))"
    }

    // MARK: - Spending Heatmap

    @ViewBuilder
    private func spendingHeatmap(_ budget: Budget) -> some View {
        let dailyData = viewModel.getDailySpending(from: budget)
        let maxDailyAmount = dailyData.map(\.amount).max() ?? 0

        VStack(alignment: .leading, spacing: 12) {
            Text("Daily Spending")
                .font(.headline)

            let gridCells = buildHeatmapCells(budget: budget, dailyData: dailyData)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(gridCells, id: \.id) { cell in
                    switch cell.type {
                    case .header(let text):
                        Text(text)
                            .font(.caption2)
                            .fontWeight(.medium)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    case .empty:
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                    case .day(let day):
                        heatmapCell(day: day, maxAmount: maxDailyAmount, budget: budget)
                    }
                }
            }

            // Legend
            HStack(spacing: 4) {
                Spacer()
                Text("Less")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                ForEach(0..<5, id: \.self) { level in
                    RoundedRectangle(cornerRadius: 2)
                        .fill(heatmapColorForLevel(level))
                        .frame(width: 12, height: 12)
                }
                Text("More")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    struct HeatmapCell {
        let id: String
        let type: HeatmapCellType
    }

    enum HeatmapCellType {
        case header(String)
        case empty
        case day(InsightsViewModel.DailySpending)
    }

    private func buildHeatmapCells(budget: Budget, dailyData: [InsightsViewModel.DailySpending]) -> [HeatmapCell] {
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

    @ViewBuilder
    private func heatmapCell(day: InsightsViewModel.DailySpending, maxAmount: Decimal, budget: Budget) -> some View {
        let isFuture = isFutureDay(day: day.id, budget: budget)

        ZStack {
            RoundedRectangle(cornerRadius: 4)
                .fill(isFuture ? Color(.systemGray5) : heatmapColor(amount: day.amount, max: maxAmount))

            Text("\(day.id)")
                .font(.system(size: 10))
                .foregroundStyle(isFuture ? Color.secondary : (day.amount > 0 ? Color.white : Color.secondary))
        }
        .aspectRatio(1, contentMode: .fit)
    }

    private func firstWeekdayOfMonth(_ budget: Budget) -> Int {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        var components = DateComponents()
        components.year = budget.year
        components.month = budget.month + 1  // 0-indexed to 1-indexed
        components.day = 1
        guard let date = utcCalendar.date(from: components) else { return 0 }
        // weekday is 1=Sunday, 2=Monday, etc. We want 0-indexed offset
        return utcCalendar.component(.weekday, from: date) - 1
    }

    private func isFutureDay(day: Int, budget: Budget) -> Bool {
        guard isCurrentMonth(budget) else { return false }
        return day > todayDay()
    }

    private func heatmapColor(amount: Decimal, max: Decimal) -> Color {
        guard amount > 0, max > 0 else { return Color(.systemGray6) }
        let ratio = Double(truncating: (amount / max) as NSNumber)
        if ratio < 0.25 { return Color.green.opacity(0.35) }
        if ratio < 0.50 { return Color.green.opacity(0.6) }
        if ratio < 0.75 { return Color.orange.opacity(0.7) }
        return Color.red.opacity(0.8)
    }

    private func heatmapColorForLevel(_ level: Int) -> Color {
        switch level {
        case 0: return Color(.systemGray6)
        case 1: return Color.green.opacity(0.35)
        case 2: return Color.green.opacity(0.6)
        case 3: return Color.orange.opacity(0.7)
        default: return Color.red.opacity(0.8)
        }
    }

    // MARK: - Spending Trends Chart

    private var spendingTrendsChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Spending Trends")
                .font(.headline)

            let trendData = viewModel.getSpendingTrendData()

            if trendData.isEmpty {
                Text("Not enough data for trends")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
            } else {
                Chart(trendData, id: \.id) { item in
                    LineMark(
                        x: .value("Month", item.monthLabel),
                        y: .value("Amount", item.amount)
                    )
                    .foregroundStyle(by: .value("Category", item.category))

                    PointMark(
                        x: .value("Month", item.monthLabel),
                        y: .value("Amount", item.amount)
                    )
                    .foregroundStyle(by: .value("Category", item.category))
                }
                .frame(height: 200)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 0
        return formatter.string(from: value as NSNumber) ?? "$0"
    }
}

#Preview {
    NavigationStack {
        InsightsView()
    }
}
