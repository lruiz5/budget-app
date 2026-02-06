import SwiftUI

struct BudgetView: View {
    @StateObject private var viewModel = BudgetViewModel()
    @State private var selectedItem: BudgetItem?
    @State private var showAddItem = false
    @State private var selectedCategoryId: Int?

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
        .sheet(item: $selectedItem) { item in
            BudgetItemDetail(item: item, onUpdate: {
                Task { await viewModel.loadBudget() }
            }, onUpdatePlanned: { id, planned in
                await viewModel.updateItem(id: id, name: nil, planned: planned)
            })
        }
        .sheet(isPresented: $showAddItem) {
            if let categoryId = selectedCategoryId {
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
                BudgetSummaryCard(budget: budget)
            }

            // Categories
            ForEach(sortedCategories(budget.categories), id: \.id) { category in
                CategorySection(
                    category: category,
                    onItemTap: { item in
                        selectedItem = item
                    },
                    onAddItem: {
                        selectedCategoryId = category.id
                        showAddItem = true
                    },
                    onDeleteItem: { itemId in
                        Task { await viewModel.deleteItem(id: itemId) }
                    },
                    onReorderItems: { itemIds in
                        Task { await viewModel.reorderItems(itemIds: itemIds) }
                    }
                )
            }
        }
        .listStyle(.insetGrouped)
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

    private var totalPlanned: Decimal {
        budget.categories.values.reduce(0) { $0 + $1.planned }
    }

    private var totalActual: Decimal {
        budget.categories.values.reduce(0) { $0 + $1.actual }
    }

    private var incomeCategory: BudgetCategory? {
        budget.categories.values.first { $0.categoryType.lowercased() == "income" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading) {
                    Text("Buffer")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(budget.buffer))
                        .font(.title2)
                        .fontWeight(.semibold)
                }

                Spacer()

                VStack(alignment: .trailing) {
                    Text("Income")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(incomeCategory?.actual ?? 0))
                        .font(.title2)
                        .fontWeight(.semibold)
                        .foregroundStyle(.green)
                }
            }

            Divider()

            HStack {
                VStack(alignment: .leading) {
                    Text("Planned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(totalPlanned))
                        .font(.headline)
                }

                Spacer()

                VStack(alignment: .trailing) {
                    Text("Actual")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(totalActual))
                        .font(.headline)
                }
            }
        }
        .padding(.vertical, 4)
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
