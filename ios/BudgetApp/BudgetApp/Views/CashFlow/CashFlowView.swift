import SwiftUI

private struct CashFlowSelectedItem: Identifiable {
    let item: BudgetItem
    let categoryType: String
    var id: Int { item.id }
}

struct CashFlowView: View {
    @EnvironmentObject private var budgetVM: BudgetViewModel
    @State private var selectedItem: CashFlowSelectedItem?

    private let monthNames = ["January", "February", "March", "April", "May", "June",
                              "July", "August", "September", "October", "November", "December"]

    private var isCurrentMonth: Bool {
        let now = Date()
        let cal = Calendar.current
        return budgetVM.selectedMonth == cal.component(.month, from: now) - 1
            && budgetVM.selectedYear == cal.component(.year, from: now)
    }

    private var todayDay: Int {
        Calendar.current.component(.day, from: Date())
    }

    private var totalScheduledIncome: Decimal {
        budgetVM.scheduledItems
            .filter { $0.categoryType.lowercased() == "income" }
            .reduce(0) { $0 + $1.item.planned }
    }

    private var totalScheduledExpenses: Decimal {
        budgetVM.scheduledItems
            .filter { $0.categoryType.lowercased() != "income" }
            .reduce(0) { $0 + $1.item.planned }
    }

    private var netCashFlow: Decimal {
        totalScheduledIncome - totalScheduledExpenses
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 16) {
                // Summary Cards
                summaryCards

                // Scheduled Timeline
                if !budgetVM.scheduledItems.isEmpty {
                    scheduledSection
                }

                // Unscheduled
                if !budgetVM.unscheduledItems.isEmpty {
                    unscheduledSection
                }

                // Empty State
                if budgetVM.scheduledItems.isEmpty && budgetVM.unscheduledItems.isEmpty && !budgetVM.isLoading {
                    emptyState
                }
            }
            .padding()
        }
        .refreshable {
            await budgetVM.loadBudget(skipCache: true)
        }
        .sheet(item: $selectedItem) { selected in
            BudgetItemDetail(
                item: selected.item,
                categoryType: selected.categoryType,
                onUpdate: {
                    Task { await budgetVM.loadBudget(skipCache: true) }
                },
                onUpdatePlanned: { id, planned in
                    await budgetVM.updateItem(id: id, name: nil, planned: planned)
                },
                onUpdateName: { id, name in
                    await budgetVM.updateItem(id: id, name: name, planned: nil)
                },
                onUpdateExpectedDay: { id, day in
                    Task { await budgetVM.updateExpectedDay(id: id, day: day) }
                }
            )
        }
    }

    // MARK: - Summary Cards

    private var summaryCards: some View {
        HStack(spacing: 12) {
            SummaryCard(
                title: "Income",
                amount: totalScheduledIncome,
                prefix: "+",
                color: .green
            )
            SummaryCard(
                title: "Expenses",
                amount: totalScheduledExpenses,
                prefix: "-",
                color: .red
            )
            SummaryCard(
                title: "Net",
                amount: abs(netCashFlow),
                prefix: netCashFlow >= 0 ? "+" : "-",
                color: netCashFlow >= 0 ? .green : .red
            )
        }
    }

    // MARK: - Scheduled Section

    private var scheduledSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Scheduled")
                .font(.outfitHeadline)
                .fontWeight(.semibold)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)

            // Buffer row at start of month
            if let buffer = budgetVM.budget?.buffer, buffer > 0 {
                let isToday = isCurrentMonth && todayDay == 1
                dayHeader(day: 1, isToday: isToday)
                HStack(spacing: 12) {
                    Text("🛡️")
                        .font(.outfit(20))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Buffer")
                            .font(.outfitBody)
                            .fontWeight(.medium)
                        Text("Starting balance")
                            .font(.outfitCaption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("+$\(buffer.formatted())")
                        .font(.outfitBody)
                        .fontWeight(.semibold)
                        .foregroundStyle(.blue)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            }

            ForEach(Array(budgetVM.scheduledItems.enumerated()), id: \.element.item.id) { index, entry in
                let day = entry.item.expectedDay ?? 0
                let bufferShown = (budgetVM.budget?.buffer ?? 0) > 0
                let showDayHeader: Bool = {
                    if index == 0 { return !(bufferShown && day == 1) }
                    return day != (budgetVM.scheduledItems[index - 1].item.expectedDay ?? 0)
                }()
                let isToday = isCurrentMonth && day == todayDay

                VStack(spacing: 0) {
                    if showDayHeader {
                        dayHeader(day: day, isToday: isToday)
                    }
                    cashFlowRow(entry: entry, day: day)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedItem = CashFlowSelectedItem(item: entry.item, categoryType: entry.categoryType)
                        }
                }
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    private func dayHeader(day: Int, isToday: Bool) -> some View {
        HStack {
            Text("\(monthNames[budgetVM.selectedMonth].prefix(3)) \(day)\(ordinalSuffix(day))")
                .font(.outfitCaption)
                .fontWeight(.semibold)
                .foregroundStyle(isToday ? .green : .secondary)
            if isToday {
                Text("Today")
                    .font(.outfitCaption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.green)
            }
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(isToday ? Color.green.opacity(0.08) : Color(.secondarySystemBackground))
    }

    private func cashFlowRow(entry: (item: BudgetItem, categoryName: String, categoryEmoji: String, categoryType: String), day: Int) -> some View {
        let isIncome = entry.categoryType.lowercased() == "income"
        let status = itemStatus(item: entry.item, expectedDay: day, isIncome: isIncome)

        return HStack(spacing: 12) {
            Text(entry.categoryEmoji)
                .font(.outfit(20))

            VStack(alignment: .leading, spacing: 2) {
                Text(entry.item.name)
                    .font(.outfitBody)
                    .fontWeight(.medium)
                Text(entry.categoryName)
                    .font(.outfitCaption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(isIncome ? "+" : "-")$\(entry.item.planned.formatted())")
                    .font(.outfitBody)
                    .fontWeight(.semibold)
                    .foregroundStyle(isIncome ? .green : .primary)

                if entry.item.actual > 0 {
                    Text("$\(entry.item.actual.formatted()) actual")
                        .font(.outfitCaption2)
                        .foregroundStyle(.secondary)
                }
            }

            Text(status.label)
                .font(.outfitCaption2)
                .fontWeight(.medium)
                .foregroundStyle(status.color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(status.bgColor)
                .clipShape(Capsule())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    // MARK: - Unscheduled Section

    private var unscheduledSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Unscheduled")
                    .font(.outfitHeadline)
                    .fontWeight(.semibold)
                Text("Items without an expected date")
                    .font(.outfitCaption)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            ForEach(budgetVM.unscheduledItems, id: \.item.id) { entry in
                let isIncome = entry.categoryType.lowercased() == "income"

                HStack(spacing: 12) {
                    Text(entry.categoryEmoji)
                        .font(.outfit(20))

                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.item.name)
                            .font(.outfitBody)
                            .fontWeight(.medium)
                        Text(entry.categoryName)
                            .font(.outfitCaption)
                            .foregroundStyle(.secondary)
                    }

                    Spacer()

                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(isIncome ? "+" : "-")$\(entry.item.planned.formatted())")
                            .font(.outfitBody)
                            .fontWeight(.semibold)
                            .foregroundStyle(isIncome ? .green : .primary)

                        if entry.item.actual > 0 {
                            Text("$\(entry.item.actual.formatted()) actual")
                                .font(.outfitCaption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
                .onTapGesture {
                    selectedItem = CashFlowSelectedItem(item: entry.item, categoryType: entry.categoryType)
                }

                if entry.item.id != budgetVM.unscheduledItems.last?.item.id {
                    Divider().padding(.leading, 52)
                }
            }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "calendar")
                .font(.system(size: 32))
                .foregroundStyle(.secondary)
            Text("No budget items yet")
                .font(.outfitHeadline)
                .fontWeight(.semibold)
            Text("Add items to your budget and set expected dates to see your cash flow timeline.")
                .font(.outfitBody)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    // MARK: - Helpers

    private func itemStatus(item: BudgetItem, expectedDay: Int, isIncome: Bool) -> (label: String, color: Color, bgColor: Color) {
        let hasTransactions = item.actual > 0
        let isFulfilled = hasTransactions && item.actual >= item.planned && item.planned > 0

        if isFulfilled {
            return (isIncome ? "Received" : "Paid", .green, .green.opacity(0.1))
        }
        if hasTransactions {
            return ("Partial", .orange, .orange.opacity(0.1))
        }
        if isCurrentMonth && expectedDay < todayDay {
            return ("Overdue", .red, .red.opacity(0.1))
        }
        return ("Upcoming", .secondary, Color(.secondarySystemBackground))
    }

    private func ordinalSuffix(_ day: Int) -> String {
        if day >= 11 && day <= 13 { return "th" }
        switch day % 10 {
        case 1: return "st"
        case 2: return "nd"
        case 3: return "rd"
        default: return "th"
        }
    }
}

// MARK: - Summary Card

private struct SummaryCard: View {
    let title: String
    let amount: Decimal
    let prefix: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.outfitCaption)
                .foregroundStyle(.secondary)
            Text("\(prefix)$\(amount.formatted())")
                .font(.outfitSubheadline)
                .fontWeight(.bold)
                .foregroundStyle(color)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }
}

#Preview {
    NavigationStack {
        CashFlowView()
            .navigationTitle("Cash Flow")
            .environmentObject(BudgetViewModel())
    }
}
