import SwiftUI

// MARK: - Sheet Enum (single .sheet pattern to avoid SwiftUI multi-sheet bug)

enum BudgetActiveSheet: Identifiable {
    case itemDetail(BudgetItem)
    case addItem(categoryId: Int)
    case addCategory
    case resetBudget

    var id: String {
        switch self {
        case .itemDetail(let item): return "detail-\(item.id)"
        case .addItem(let catId): return "add-\(catId)"
        case .addCategory: return "add-category"
        case .resetBudget: return "reset-budget"
        }
    }
}

struct BudgetView: View {
    @StateObject private var viewModel = BudgetViewModel()
    @State private var activeSheet: BudgetActiveSheet?
    @State private var categoryToDelete: BudgetCategory?
    @State private var showDeleteCategoryConfirmation = false

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
            case .addCategory:
                AddCategorySheet(onSave: { name, emoji in
                    await viewModel.createCategory(name: name, emoji: emoji)
                })
            case .resetBudget:
                if let budget = viewModel.budget {
                    ResetBudgetSheet(budget: budget, onReset: { mode in
                        await viewModel.resetBudget(mode: mode)
                    })
                }
            }
        }
        .confirmationDialog(
            "Delete Category",
            isPresented: $showDeleteCategoryConfirmation,
            presenting: categoryToDelete
        ) { category in
            Button("Delete \"\(category.name)\"", role: .destructive) {
                Task { await viewModel.deleteCategory(id: category.id) }
            }
        } message: { category in
            Text("This will permanently delete \"\(category.name)\" and all its budget items. Transactions will be uncategorized.")
        }
        .toast(
            isPresented: $viewModel.showToast,
            message: viewModel.toastMessage ?? "",
            isError: viewModel.isToastError
        )
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
                    },
                    onDeleteCategory: isCustomCategory(category) ? {
                        categoryToDelete = category
                        showDeleteCategoryConfirmation = true
                    } : nil
                )
            }

            // Add Category button
            Section {
                Button {
                    activeSheet = .addCategory
                } label: {
                    Label("Add Category", systemImage: "plus.circle.fill")
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                }
            }

            // Reset Budget button
            Section {
                Button {
                    activeSheet = .resetBudget
                } label: {
                    Label("Reset Budget", systemImage: "arrow.counterclockwise")
                        .font(.subheadline)
                        .foregroundStyle(.red)
                }
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

    private func isCustomCategory(_ category: BudgetCategory) -> Bool {
        !Constants.defaultCategories.contains(category.categoryType.lowercased())
    }

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

    private var incomePlanned: Decimal {
        budget.categories.values
            .first { $0.categoryType.lowercased() == "income" }?.planned ?? 0
    }

    private var incomeActual: Decimal {
        budget.categories.values
            .first { $0.categoryType.lowercased() == "income" }?.actual ?? 0
    }

    private var expensePlanned: Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .reduce(0) { $0 + $1.planned }
    }

    private var expenseActual: Decimal {
        budget.categories.values
            .filter { $0.categoryType.lowercased() != "income" }
            .reduce(0) { $0 + $1.actual }
    }

    var body: some View {
        HStack {
            // Buffer (tappable to edit)
            VStack(alignment: .leading, spacing: 4) {
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

            // Income progress ring
            MiniProgressRing(
                label: "Income",
                actual: incomeActual,
                planned: incomePlanned,
                tint: .green
            )

            Spacer()

            // Expenses progress ring
            MiniProgressRing(
                label: "Expenses",
                actual: expenseActual,
                planned: expensePlanned,
                tint: .orange
            )
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

// MARK: - Mini Progress Ring

struct MiniProgressRing: View {
    let label: String
    let actual: Decimal
    let planned: Decimal
    let tint: Color

    private var progress: Double {
        guard planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (actual / planned) as NSNumber))
    }

    private var isOver: Bool {
        actual > planned && planned > 0
    }

    private var ringColor: Color {
        isOver ? .red : tint
    }

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(Color(.systemGray5), lineWidth: 4)

                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(ringColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))

                Text(percentText)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(isOver ? .red : .primary)
            }
            .frame(width: 44, height: 44)

            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)

            Text(formatCompact(actual))
                .font(.caption2)
                .fontWeight(.medium)
                .foregroundStyle(isOver ? .red : .primary)
        }
    }

    private var percentText: String {
        guard planned > 0 else { return "0%" }
        let pct = Int(Double(truncating: (actual / planned * 100) as NSNumber))
        return "\(pct)%"
    }

    private func formatCompact(_ value: Decimal) -> String {
        let num = Double(truncating: value as NSNumber)
        if num >= 1000 {
            return "$\(String(format: "%.1f", num / 1000))k"
        }
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 0
        return formatter.string(from: value as NSNumber) ?? "$0"
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

    private var hasAnyPlanning: Bool {
        budget.buffer > 0 || incomePlanned > 0 || expensePlanned > 0
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
        if !hasAnyPlanning {
            return "dollarsign.circle"
        } else if leftToBudget > 0 {
            return "exclamationmark.circle.fill"
        } else if leftToBudget == 0 {
            return "checkmark.circle.fill"
        } else {
            return "exclamationmark.triangle.fill"
        }
    }

    private var bannerText: String {
        if !hasAnyPlanning {
            return "Start planning your budget"
        } else if leftToBudget > 0 {
            return "\(formatCurrency(leftToBudget)) left to budget"
        } else if leftToBudget == 0 {
            return "Every dollar is assigned!"
        } else {
            return "Over budgeted by \(formatCurrency(abs(leftToBudget)))"
        }
    }

    private var backgroundColor: Color {
        if !hasAnyPlanning {
            return Color(.systemGray5)
        } else if leftToBudget > 0 {
            return Color.orange.opacity(0.15)
        } else if leftToBudget == 0 {
            return Color.green.opacity(0.15)
        } else {
            return Color.red.opacity(0.15)
        }
    }

    private var foregroundColor: Color {
        if !hasAnyPlanning {
            return .secondary
        } else if leftToBudget > 0 {
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
