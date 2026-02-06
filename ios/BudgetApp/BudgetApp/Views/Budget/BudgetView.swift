import SwiftUI

// MARK: - Sheet Enum (single .sheet pattern to avoid SwiftUI multi-sheet bug)

enum BudgetActiveSheet: Identifiable {
    case itemDetail(BudgetItem)
    case addItem(categoryId: Int)

    var id: String {
        switch self {
        case .itemDetail(let item): return "detail-\(item.id)"
        case .addItem(let catId): return "add-\(catId)"
        }
    }
}

struct BudgetView: View {
    @StateObject private var viewModel = BudgetViewModel()
    @State private var activeSheet: BudgetActiveSheet?

    var body: some View {
        Group {
            if viewModel.isLoading {
                ProgressView("Loading budget...")
            } else if let budget = viewModel.budget {
                budgetContent(budget)
            } else if let error = viewModel.error {
                errorView(error)
            } else {
                emptyBudgetView
            }
        }
        .id("\(viewModel.selectedMonth)-\(viewModel.selectedYear)")
        .toolbar {
            ToolbarItem(placement: .principal) {
                MonthYearPicker(
                    month: $viewModel.selectedMonth,
                    year: $viewModel.selectedYear,
                    onChange: { month, year in
                        Task {
                            await viewModel.loadBudgetForMonth(month: month, year: year)
                        }
                    }
                )
            }
            ToolbarItem(placement: .topBarTrailing) {
                EditButton()
            }
        }
        .refreshable {
            await viewModel.loadBudget()
        }
        .task {
            await viewModel.loadBudget()
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .itemDetail(let item):
                BudgetItemDetail(
                    item: item,
                    onUpdate: {
                        Task { await viewModel.loadBudget() }
                    },
                    onUpdatePlanned: { id, planned in
                        await viewModel.updateItem(id: id, name: nil, planned: planned)
                    },
                    onUpdateName: { id, name in
                        await viewModel.updateItem(id: id, name: name, planned: nil)
                    }
                )
            case .addItem(let categoryId):
                AddBudgetItemSheet(categoryId: categoryId, onSave: {
                    Task { await viewModel.loadBudget() }
                })
            }
        }
    }

    // MARK: - Budget Content

    @ViewBuilder
    private func budgetContent(_ budget: Budget) -> some View {
        List {
            // Summary Section
            Section {
                BudgetSummaryCard(budget: budget, onUpdateBuffer: { newBuffer in
                    Task { await viewModel.updateBuffer(newBuffer) }
                })
            }

            // Categories
            ForEach(sortedCategories(budget.categories), id: \.id) { category in
                CategorySection(
                    category: category,
                    onItemTap: { item in
                        activeSheet = .itemDetail(item)
                    },
                    onAddItem: {
                        activeSheet = .addItem(categoryId: category.id)
                    },
                    onDeleteItem: { itemId in
                        Task { await viewModel.deleteItem(id: itemId) }
                    },
                    onReorderItems: { itemIds in
                        Task { await viewModel.reorderItems(itemIds: itemIds) }
                    },
                    onUpdatePlanned: { id, planned in
                        Task { await viewModel.updateItem(id: id, name: nil, planned: planned) }
                    }
                )
            }
        }
        .listStyle(.insetGrouped)
        .safeAreaInset(edge: .bottom) {
            LeftToBudgetBanner(budget: budget)
        }
    }

    // MARK: - Empty State

    private var emptyBudgetView: some View {
        ContentUnavailableView {
            Label("No Budget Yet", systemImage: "dollarsign.circle")
        } description: {
            Text("Start planning your budget for this month")
        } actions: {
            Button("Start Planning") {
                Task { await viewModel.createBudget() }
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        ContentUnavailableView {
            Label("Error", systemImage: "exclamationmark.triangle")
        } description: {
            Text(error)
        } actions: {
            Button("Try Again") {
                Task { await viewModel.loadBudget() }
            }
            .buttonStyle(.bordered)
        }
    }

    // MARK: - Helpers

    private func sortedCategories(_ categories: [String: BudgetCategory]) -> [BudgetCategory] {
        let defaultOrder = ["income", "giving", "household", "transportation", "food", "personal", "insurance", "saving"]

        return categories.values.sorted { a, b in
            let aIndex = defaultOrder.firstIndex(of: a.categoryType.lowercased()) ?? 100
            let bIndex = defaultOrder.firstIndex(of: b.categoryType.lowercased()) ?? 100

            if aIndex != bIndex {
                return aIndex < bIndex
            }
            return a.order < b.order
        }
    }
}

// MARK: - Budget Summary Card

struct BudgetSummaryCard: View {
    let budget: Budget
    var onUpdateBuffer: ((Decimal) -> Void)?

    @State private var isEditingBuffer = false
    @State private var editedBufferText = ""
    @FocusState private var isBufferFocused: Bool

    private var totalPlanned: Decimal {
        budget.categories.values.reduce(0) { $0 + $1.planned }
    }

    private var totalActual: Decimal {
        budget.categories.values.reduce(0) { $0 + $1.actual }
    }

    var body: some View {
        HStack {
            // Buffer (tappable to edit)
            VStack(alignment: .leading) {
                Text("Buffer")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if isEditingBuffer {
                    HStack(spacing: 2) {
                        Text("$")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                        TextField("0.00", text: $editedBufferText)
                            .keyboardType(.decimalPad)
                            .font(.title3)
                            .fontWeight(.semibold)
                            .frame(width: 80)
                            .textFieldStyle(.roundedBorder)
                            .focused($isBufferFocused)
                            .onSubmit { commitBufferEdit() }
                    }
                } else {
                    Text(formatCurrency(budget.buffer))
                        .font(.title2)
                        .fontWeight(.semibold)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture {
                if !isEditingBuffer && onUpdateBuffer != nil {
                    editedBufferText = "\(budget.buffer)"
                    isEditingBuffer = true
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                        isBufferFocused = true
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing) {
                Text("Planned")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(formatCurrency(totalPlanned))
                    .font(.title2)
                    .fontWeight(.semibold)
            }

            Spacer()

            VStack(alignment: .trailing) {
                Text("Actual")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(formatCurrency(totalActual))
                    .font(.title2)
                    .fontWeight(.semibold)
            }
        }
        .padding(.vertical, 4)
        .onChange(of: isBufferFocused) { _, focused in
            if !focused && isEditingBuffer {
                commitBufferEdit()
            }
        }
    }

    private func commitBufferEdit() {
        guard let newValue = editedBufferText.toDecimal(), newValue >= 0 else {
            isEditingBuffer = false
            return
        }
        onUpdateBuffer?(newValue)
        isEditingBuffer = false
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

// MARK: - Left to Budget Banner

struct LeftToBudgetBanner: View {
    let budget: Budget

    private var incomePlanned: Decimal {
        budget.categories.values
            .first { $0.categoryType.lowercased() == "income" }?.planned ?? 0
    }

    private var expensePlanned: Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .reduce(0) { $0 + $1.planned }
    }

    private var leftToBudget: Decimal {
        budget.buffer + incomePlanned - expensePlanned
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: iconName)
                .font(.subheadline)

            Text(bannerText)
                .font(.subheadline)
                .fontWeight(.medium)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .background(backgroundColor)
        .foregroundStyle(foregroundColor)
    }

    private var iconName: String {
        if leftToBudget > 0 {
            return "exclamationmark.circle.fill"
        } else if leftToBudget == 0 {
            return "checkmark.circle.fill"
        } else {
            return "exclamationmark.triangle.fill"
        }
    }

    private var bannerText: String {
        if leftToBudget > 0 {
            return "\(formatCurrency(leftToBudget)) left to budget"
        } else if leftToBudget == 0 {
            return "Every dollar is assigned!"
        } else {
            return "Over budgeted by \(formatCurrency(abs(leftToBudget)))"
        }
    }

    private var backgroundColor: Color {
        if leftToBudget > 0 {
            return Color.orange.opacity(0.15)
        } else if leftToBudget == 0 {
            return Color.green.opacity(0.15)
        } else {
            return Color.red.opacity(0.15)
        }
    }

    private var foregroundColor: Color {
        if leftToBudget > 0 {
            return .orange
        } else if leftToBudget == 0 {
            return .green
        } else {
            return .red
        }
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
        BudgetView()
    }
}
