import SwiftUI

// MARK: - Supporting Types

struct CategorySummary: Identifiable {
    let id: String
    let name: String
    let emoji: String
    let categoryType: String
    let planned: Decimal
    let actual: Decimal
    let difference: Decimal
    let percentUsed: Double
}

struct TopSpendingItem: Identifiable {
    let id: String
    let name: String
    let category: String
    let planned: Decimal
    let actual: Decimal
    let percentOfTotal: Double
}

// MARK: - Monthly Report Sheet

struct MonthlyReportSheet: View {
    let budget: Budget
    let previousBudget: Budget?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    overallSummarySection
                    budgetVsActualSection
                    bufferFlowSection
                    categoryBreakdownSection
                    topSpendingItemsSection
                    potentialReallocationSection
                }
                .padding()
            }
            .navigationTitle("\(monthName) \(budget.year) Report")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Section 1: Overall Summary

    private var overallSummarySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Overall Summary")
                .font(.headline)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                // Total Income
                summaryCard(
                    label: "Total Income",
                    value: formatCurrency(totalIncome),
                    tint: .green,
                    trend: incomeTrend,
                    trendInverted: false
                )

                // Total Expenses
                summaryCard(
                    label: "Total Expenses",
                    value: formatCurrency(totalExpenses),
                    tint: .red,
                    trend: expenseTrend,
                    trendInverted: true
                )

                // Net Savings
                summaryCard(
                    label: "Net Savings",
                    value: formatCurrency(netSavings),
                    tint: netSavings >= 0 ? .blue : .orange,
                    trend: nil,
                    trendInverted: false
                )

                // Savings Rate
                summaryCard(
                    label: "Savings Rate",
                    value: "\(savingsRateFormatted)%",
                    tint: savingsRateDouble >= 10 ? .purple : .gray,
                    trend: nil,
                    trendInverted: false
                )
            }
        }
    }

    private func summaryCard(label: String, value: String, tint: Color, trend: Double?, trendInverted: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(tint)

            Text(value)
                .font(.title3)
                .fontWeight(.bold)
                .foregroundStyle(tint)

            if let trend = trend {
                let isPositiveTrend = trendInverted ? trend <= 0 : trend >= 0
                HStack(spacing: 2) {
                    Image(systemName: trend >= 0 ? "arrow.up" : "arrow.down")
                        .font(.caption2)
                    Text("\(String(format: "%.1f", Swift.abs(trend)))% vs last month")
                        .font(.caption2)
                }
                .foregroundStyle(isPositiveTrend ? .green : .red)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.1))
        .cornerRadius(10)
    }

    // MARK: - Section 2: Budget vs Actual

    private var budgetVsActualSection: some View {
        HStack(spacing: 12) {
            // Income
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Planned Income")
                    Spacer()
                    Text(formatCurrency(totalPlannedIncome))
                        .fontWeight(.semibold)
                }
                HStack {
                    Text("Actual Income")
                    Spacer()
                    Text(formatCurrency(totalIncome))
                        .fontWeight(.semibold)
                        .foregroundStyle(totalIncome >= totalPlannedIncome ? .green : .red)
                }
            }
            .font(.caption)
            .padding(12)
            .background(Color(.systemGray6))
            .cornerRadius(10)

            // Expenses
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Planned Expenses")
                    Spacer()
                    Text(formatCurrency(totalPlannedExpenses))
                        .fontWeight(.semibold)
                }
                HStack {
                    Text("Actual Expenses")
                    Spacer()
                    Text(formatCurrency(totalExpenses))
                        .fontWeight(.semibold)
                        .foregroundStyle(totalExpenses <= totalPlannedExpenses ? .green : .red)
                }
            }
            .font(.caption)
            .padding(12)
            .background(Color(.systemGray6))
            .cornerRadius(10)
        }
    }

    // MARK: - Section 3: Buffer Flow

    private var bufferFlowSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Buffer Flow")
                .font(.headline)

            VStack(spacing: 8) {
                flowRow(label: "+ Underspent", value: formatCurrency(totalUnderspent), color: .green)
                flowRow(label: "- Overspent", value: formatCurrency(totalOverspent), color: .red)

                if leftToBudget > 0 {
                    flowRow(label: "+ Left to Budget", value: formatCurrency(leftToBudget), color: .green)
                }

                Divider()

                HStack {
                    Text("Projected Next Month")
                        .fontWeight(.semibold)
                    Spacer()
                    Text(formatCurrency(projectedBuffer))
                        .fontWeight(.bold)
                        .foregroundStyle(projectedBuffer >= 0 ? .blue : .red)
                }
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)

            Text(totalExpenses == 0 && totalIncome == 0
                 ? "Start adding transactions to see how next month\u{2019}s buffer changes over time."
                 : "This shows how your buffer would change based on this month\u{2019}s spending and income patterns.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func flowRow(label: String, value: String, color: Color) -> some View {
        HStack {
            Text(label)
                .foregroundStyle(color)
            Spacer()
            Text(value)
                .foregroundStyle(color)
        }
    }

    // MARK: - Section 4: Category Breakdown

    private var categoryBreakdownSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Category Breakdown")
                .font(.headline)

            if totalExpenses == 0 {
                Text("No spending recorded yet. The breakdown below shows your planned amounts.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            ForEach(categorySummaries, id: \.id) { cat in
                categoryRow(cat)
            }
        }
    }

    @ViewBuilder
    private func categoryRow(_ cat: CategorySummary) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("\(cat.emoji) \(cat.name)")
                    .fontWeight(.medium)
                Spacer()
            }

            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Planned").font(.caption2).foregroundStyle(.secondary)
                    Text(formatCurrency(cat.planned)).font(.caption).fontWeight(.semibold)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Actual").font(.caption2).foregroundStyle(.secondary)
                    Text(formatCurrency(cat.actual)).font(.caption).fontWeight(.semibold)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text(cat.difference >= 0 ? "Under" : "Over")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(abs(cat.difference)))
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(cat.difference >= 0 ? .green : .red)
                }
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color(.systemGray5))
                    Capsule()
                        .fill(progressColor(cat.percentUsed))
                        .frame(width: geo.size.width * min(1.0, CGFloat(cat.percentUsed / 100)))
                }
            }
            .frame(height: 6)

            HStack {
                Spacer()
                Text("\(Int(cat.percentUsed))% used")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if let trend = categoryTrend(for: cat.categoryType) {
                HStack(spacing: 4) {
                    Image(systemName: Swift.abs(trend) < 1 ? "minus" : (trend > 0 ? "arrow.up" : "arrow.down"))
                        .font(.caption2)
                    Text(Swift.abs(trend) < 1
                         ? "About the same as last month"
                         : "\(Int(Swift.abs(trend)))% \(trend > 0 ? "more" : "less") than last month")
                        .font(.caption2)
                }
                .foregroundStyle(Swift.abs(trend) < 1 ? Color.secondary : (trend > 0 ? Color.red : Color.green))
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func progressColor(_ percent: Double) -> Color {
        if percent > 100 { return .red }
        if percent > 90 { return .yellow }
        return .green
    }

    // MARK: - Section 5: Top Spending Items

    private var topSpendingItemsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Top Spending Items")
                .font(.headline)

            if topSpendingItems.isEmpty {
                VStack(spacing: 4) {
                    Text("No spending recorded yet this month.")
                        .foregroundStyle(.secondary)
                    Text("Add transactions to see your top spending items here.")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .background(Color(.systemGray6))
                .cornerRadius(12)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(topSpendingItems.enumerated()), id: \.element.id) { index, item in
                        HStack {
                            Text("\(index + 1)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .frame(width: 24, alignment: .leading)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name)
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                Text(item.category)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            VStack(alignment: .trailing, spacing: 2) {
                                Text(formatCurrency(item.actual))
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                                    .foregroundStyle(item.actual > item.planned ? .red : .primary)
                                Text("\(String(format: "%.1f", item.percentOfTotal))% of total")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)

                        if index < topSpendingItems.count - 1 {
                            Divider()
                                .padding(.leading, 36)
                        }
                    }
                }
                .background(Color(.systemGray6))
                .cornerRadius(12)
            }
        }
    }

    // MARK: - Section 6: Potential Reallocation

    @ViewBuilder
    private var potentialReallocationSection: some View {
        if !underspentCategories.isEmpty && totalExpenses > 0 {
            VStack(alignment: .leading, spacing: 12) {
                Text("Potential Reallocation")
                    .font(.headline)

                Text("These categories were under 50% utilized. Consider adjusting next month\u{2019}s budget.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(underspentCategories) { cat in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(cat.emoji) \(cat.name)")
                                .font(.subheadline)
                                .fontWeight(.medium)
                            Text("\(formatCurrency(cat.actual)) of \(formatCurrency(cat.planned)) used")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                            Text("\(formatCurrency(cat.difference)) unused")
                                .font(.caption)
                                .foregroundStyle(.orange)
                                .fontWeight(.medium)
                        }
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.orange.opacity(0.1))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                        )
                        .cornerRadius(10)
                    }
                }
            }
        }
    }

    // MARK: - Computed Properties

    private var monthName: String {
        let names = ["January", "February", "March", "April", "May", "June",
                     "July", "August", "September", "October", "November", "December"]
        guard budget.month >= 0 && budget.month < 12 else { return "" }
        return names[budget.month]
    }

    // Income
    private var incomeCategory: BudgetCategory? {
        budget.categories.values.first { $0.categoryType.lowercased() == "income" }
    }

    private var totalIncome: Decimal {
        incomeCategory?.actual ?? 0
    }

    private var totalPlannedIncome: Decimal {
        incomeCategory?.planned ?? 0
    }

    // Expense categories (excludes income AND saving for totals)
    private var expenseCategories: [BudgetCategory] {
        budget.categories.values.filter {
            $0.categoryType.lowercased() != "income" && $0.categoryType.lowercased() != "saving"
        }
    }

    private var totalExpenses: Decimal {
        expenseCategories.reduce(0) { $0 + $1.actual }
    }

    private var totalPlannedExpenses: Decimal {
        expenseCategories.reduce(0) { $0 + $1.planned }
    }

    // Overall summary
    private var totalAvailable: Decimal {
        budget.buffer + totalIncome
    }

    private var netSavings: Decimal {
        totalAvailable - totalExpenses
    }

    private var savingsRateDouble: Double {
        guard totalAvailable > 0 else { return 0 }
        return Double(truncating: (netSavings / totalAvailable * 100) as NSNumber)
    }

    private var savingsRateFormatted: String {
        String(format: "%.1f", savingsRateDouble)
    }

    // Buffer flow — underspent/overspent calculated PER ITEM (matching web)
    private var totalUnderspent: Decimal {
        expenseCategories.reduce(Decimal(0)) { result, category in
            result + category.items.reduce(Decimal(0)) { sum, item in
                sum + max(0, item.planned - item.actual)
            }
        }
    }

    private var totalOverspent: Decimal {
        expenseCategories.reduce(Decimal(0)) { result, category in
            result + category.items.reduce(Decimal(0)) { sum, item in
                sum + max(0, item.actual - item.planned)
            }
        }
    }

    // Left to budget includes ALL non-income planned (including saving)
    private var allPlannedExpensesIncludingSaving: Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .reduce(0) { $0 + $1.planned }
    }

    private var leftToBudget: Decimal {
        max(0, budget.buffer + totalPlannedIncome - allPlannedExpensesIncludingSaving)
    }

    private var projectedBuffer: Decimal {
        totalUnderspent - totalOverspent + leftToBudget
    }

    // Category summaries (excludes income, includes saving, sorted by actual desc)
    private var categorySummaries: [CategorySummary] {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .map { cat in
                let planned = cat.planned
                let actual = cat.actual
                let difference = planned - actual
                let percentUsed = planned > 0 ? Double(truncating: (actual / planned * 100) as NSNumber) : 0

                return CategorySummary(
                    id: cat.categoryType,
                    name: cat.name,
                    emoji: cat.emoji ?? cat.categoryEmoji,
                    categoryType: cat.categoryType,
                    planned: planned,
                    actual: actual,
                    difference: difference,
                    percentUsed: percentUsed
                )
            }
            .sorted { $0.actual > $1.actual }
    }

    // Top spending items (top 10 from expense categories)
    private var topSpendingItems: [TopSpendingItem] {
        var items: [TopSpendingItem] = []
        let total = totalExpenses

        for category in expenseCategories {
            for item in category.items where item.actual > 0 {
                items.append(TopSpendingItem(
                    id: "\(category.categoryType)-\(item.name)",
                    name: item.name,
                    category: category.name,
                    planned: item.planned,
                    actual: item.actual,
                    percentOfTotal: total > 0 ? Double(truncating: (item.actual / total * 100) as NSNumber) : 0
                ))
            }
        }

        return items.sorted { $0.actual > $1.actual }.prefix(10).map { $0 }
    }

    // Underspent categories (< 50% utilized)
    private var underspentCategories: [CategorySummary] {
        categorySummaries.filter { $0.planned > 0 && $0.percentUsed < 50 }
    }

    // MARK: - Trends

    private var incomeTrend: Double? {
        guard let prev = previousBudget,
              let prevIncome = prev.categories.values.first(where: { $0.categoryType.lowercased() == "income" })?.actual,
              prevIncome > 0 else { return nil }
        return Double(truncating: ((totalIncome - prevIncome) / prevIncome * 100) as NSNumber)
    }

    private var expenseTrend: Double? {
        guard let prev = previousBudget else { return nil }
        let prevExpenses = prev.categories.values
            .filter { $0.categoryType.lowercased() != "income" && $0.categoryType.lowercased() != "saving" }
            .reduce(Decimal(0)) { $0 + $1.actual }
        guard prevExpenses > 0 else { return nil }
        return Double(truncating: ((totalExpenses - prevExpenses) / prevExpenses * 100) as NSNumber)
    }

    private func categoryTrend(for categoryType: String) -> Double? {
        guard let prev = previousBudget,
              let prevCat = prev.categories[categoryType],
              prevCat.actual > 0 else { return nil }
        guard let currentCat = budget.categories[categoryType] else { return nil }
        return Double(truncating: ((currentCat.actual - prevCat.actual) / prevCat.actual * 100) as NSNumber)
    }

    // MARK: - Helpers

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }

    private func abs(_ value: Decimal) -> Decimal {
        value < 0 ? -value : value
    }
}

#Preview {
    MonthlyReportSheet(
        budget: Budget(
            id: 1, userId: "preview", month: 1, year: 2026,
            buffer: 500, createdAt: Date(),
            categories: [
                "income": BudgetCategory(id: 1, budgetId: 1, categoryType: "income", name: "Income", order: 0, items: [
                    BudgetItem(id: 1, categoryId: 1, name: "Salary", planned: 5000, actual: 5000)
                ], planned: 5000, actual: 5000),
                "food": BudgetCategory(id: 2, budgetId: 1, categoryType: "food", name: "Food", order: 4, items: [
                    BudgetItem(id: 2, categoryId: 2, name: "Groceries", planned: 400, actual: 350),
                    BudgetItem(id: 3, categoryId: 2, name: "Restaurants", planned: 200, actual: 275)
                ], planned: 600, actual: 625),
                "household": BudgetCategory(id: 3, budgetId: 1, categoryType: "household", name: "Household", order: 2, items: [
                    BudgetItem(id: 4, categoryId: 3, name: "Rent", planned: 1500, actual: 1500),
                    BudgetItem(id: 5, categoryId: 3, name: "Utilities", planned: 200, actual: 150)
                ], planned: 1700, actual: 1650),
                "saving": BudgetCategory(id: 4, budgetId: 1, categoryType: "saving", name: "Saving", order: 7, items: [
                    BudgetItem(id: 6, categoryId: 4, name: "Emergency Fund", planned: 500, actual: 500)
                ], planned: 500, actual: 500)
            ]
        ),
        previousBudget: nil
    )
}
