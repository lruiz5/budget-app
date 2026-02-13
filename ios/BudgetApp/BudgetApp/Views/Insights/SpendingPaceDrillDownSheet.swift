import SwiftUI
import Charts

struct SpendingPaceDrillDownSheet: View {
    let budget: Budget
    let viewModel: InsightsViewModel

    @Environment(\.dismiss) private var dismiss
    @State private var selectedCategoryType: String = ""

    private var rankings: [InsightsViewModel.OverspendRisk] {
        viewModel.getOverspendRanking(from: budget)
    }

    private var selectedCategory: BudgetCategory? {
        rankings.first { $0.category.categoryType == selectedCategoryType }?.category
    }

    private var selectedRisk: InsightsViewModel.OverspendRisk? {
        rankings.first { $0.category.categoryType == selectedCategoryType }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    if rankings.isEmpty {
                        Text("No expense categories with planned amounts")
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 40)
                    } else {
                        categoryPicker
                        if let category = selectedCategory, let risk = selectedRisk {
                            summaryCard(category: category, paceRatio: risk.paceRatio)
                            categoryChart(category: category)
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("Spending Pace")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear {
                if selectedCategoryType.isEmpty, let first = rankings.first {
                    selectedCategoryType = first.category.categoryType
                }
            }
        }
    }

    // MARK: - Category Picker

    private var categoryPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(rankings) { risk in
                    let isSelected = risk.category.categoryType == selectedCategoryType
                    let pacePercent = Int(risk.paceRatio * 100)

                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedCategoryType = risk.category.categoryType
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(risk.category.categoryEmoji)
                                .font(.caption)
                            Text(risk.category.name)
                                .font(.caption)
                                .fontWeight(.medium)
                            Text("·")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("\(pacePercent)%")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundStyle(risk.paceRatio > 1.0 ? .red : .green)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(isSelected ? Color.teal.opacity(0.15) : Color(.systemGray5))
                        .foregroundStyle(isSelected ? .teal : .primary)
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(isSelected ? Color.teal : Color.clear, lineWidth: 1.5)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 4)
        }
    }

    // MARK: - Summary Card

    private func summaryCard(category: BudgetCategory, paceRatio: Double) -> some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Planned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(category.planned))
                        .font(.title3)
                        .fontWeight(.semibold)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Actual")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(category.actual))
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundStyle(category.actual > category.planned ? .red : .primary)
                }
            }

            let pacePercent = Int(paceRatio * 100)
            HStack {
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: paceRatio > 1.0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                        .font(.subheadline)
                    Text(paceRatio > 1.0 ? "\(pacePercent)% of pace — on track to overspend" : "\(pacePercent)% of pace — on track")
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
                .foregroundStyle(paceRatio > 1.0 ? .red : .green)
                Spacer()
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Per-Category Chart

    @ViewBuilder
    private func categoryChart(category: BudgetCategory) -> some View {
        let dailyData = viewModel.getDailySpendingForCategory(from: budget, categoryType: category.categoryType)
        let planned = category.planned

        VStack(alignment: .leading, spacing: 12) {
            Text("\(category.displayName) Burn-Down")
                .font(.subheadline)
                .fontWeight(.medium)

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
                        y: .value("Amount", planned),
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

                    // Today marker
                    if isCurrentMonth {
                        let today = todayDay
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

    // MARK: - Helpers

    private var isCurrentMonth: Bool {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let now = Date()
        let currentMonth = utcCalendar.component(.month, from: now) - 1
        let currentYear = utcCalendar.component(.year, from: now)
        return budget.month == currentMonth && budget.year == currentYear
    }

    private var todayDay: Int {
        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        return utcCalendar.component(.day, from: Date())
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 0
        return formatter.string(from: value as NSNumber) ?? "$0"
    }

    private func formatCurrencyShort(_ value: Decimal) -> String {
        let doubleVal = Double(truncating: value as NSNumber)
        if doubleVal >= 1000 {
            return "$\(Int(doubleVal / 1000))k"
        }
        return "$\(Int(doubleVal))"
    }
}
