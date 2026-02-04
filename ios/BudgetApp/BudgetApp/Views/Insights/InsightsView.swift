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
                MonthlyReportSheet(budget: budget)
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
                Chart(categoryData, id: \.category) { item in
                    BarMark(
                        x: .value("Amount", item.planned),
                        y: .value("Category", item.category)
                    )
                    .foregroundStyle(.gray.opacity(0.3))

                    BarMark(
                        x: .value("Amount", item.actual),
                        y: .value("Category", item.category)
                    )
                    .foregroundStyle(item.actual > item.planned ? .red : .green)
                }
                .chartXAxis {
                    AxisMarks(position: .bottom) { value in
                        AxisValueLabel {
                            if let amount = value.as(Decimal.self) {
                                Text(formatCurrency(amount))
                                    .font(.caption)
                            }
                        }
                    }
                }
                .frame(height: CGFloat(categoryData.count * 50 + 40))
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
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

// MARK: - Monthly Report Sheet

struct MonthlyReportSheet: View {
    let budget: Budget
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Buffer Flow Section
                    bufferFlowSection

                    // Category Breakdown
                    categoryBreakdownSection
                }
                .padding()
            }
            .navigationTitle("Monthly Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var bufferFlowSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Buffer Flow")
                .font(.headline)

            VStack(spacing: 8) {
                HStack {
                    Text("Current Buffer")
                    Spacer()
                    Text(formatCurrency(budget.buffer))
                }

                HStack {
                    Text("+ Underspent")
                        .foregroundStyle(.green)
                    Spacer()
                    Text(formatCurrency(underspent))
                        .foregroundStyle(.green)
                }

                HStack {
                    Text("- Overspent")
                        .foregroundStyle(.red)
                    Spacer()
                    Text(formatCurrency(overspent))
                        .foregroundStyle(.red)
                }

                Divider()

                HStack {
                    Text("Projected Next Month")
                        .fontWeight(.semibold)
                    Spacer()
                    Text(formatCurrency(projectedBuffer))
                        .fontWeight(.semibold)
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
        }
    }

    private var categoryBreakdownSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Category Breakdown")
                .font(.headline)

            ForEach(sortedCategories, id: \.id) { category in
                HStack {
                    Text(category.displayName)
                    Spacer()
                    Text(formatCurrency(category.actual))
                        .foregroundStyle(category.actual > category.planned ? .red : .primary)
                    Text("/ \(formatCurrency(category.planned))")
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var sortedCategories: [BudgetCategory] {
        budget.categories.values.sorted { $0.order < $1.order }
    }

    private var underspent: Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" && $0.categoryType.lowercased() != "saving" }
            .reduce(Decimal(0)) { result, category in
                result + max(0, category.planned - category.actual)
            }
    }

    private var overspent: Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" && $0.categoryType.lowercased() != "saving" }
            .reduce(Decimal(0)) { result, category in
                result + max(0, category.actual - category.planned)
            }
    }

    private var projectedBuffer: Decimal {
        budget.buffer + underspent - overspent
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

#Preview {
    NavigationStack {
        InsightsView()
    }
}
