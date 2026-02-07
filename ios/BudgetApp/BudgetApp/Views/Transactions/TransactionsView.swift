import SwiftUI

// MARK: - Active Sheet Enum (single .sheet pattern to avoid SwiftUI multi-sheet bugs)

enum TransactionActiveSheet: Identifiable {
    case addTransaction
    case editTransaction(Transaction)
    case categorizeTransaction(Transaction)
    case splitTransaction(Transaction)

    var id: String {
        switch self {
        case .addTransaction: return "add"
        case .editTransaction(let t): return "edit-\(t.id)"
        case .categorizeTransaction(let t): return "categorize-\(t.id)"
        case .splitTransaction(let t): return "split-\(t.id)"
        }
    }
}

struct TransactionsView: View {
    @ObservedObject var viewModel: TransactionsViewModel
    @State private var selectedFilter: TransactionFilter = .uncategorized
    @State private var activeSheet: TransactionActiveSheet?

    var body: some View {
        VStack(spacing: 0) {
            // Filter Picker
            Picker("Filter", selection: $selectedFilter) {
                ForEach(TransactionFilter.allCases, id: \.self) { filter in
                    Text(filter.title).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            // Transaction List
            if isCurrentTabLoading {
                Spacer()
                ProgressView("Loading transactions...")
                Spacer()
            } else if currentTransactions.isEmpty {
                emptyStateView
            } else {
                transactionList
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    activeSheet = .addTransaction
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable {
            await viewModel.loadTransactions()
            if selectedFilter == .deleted {
                await viewModel.loadDeletedTransactions()
            }
        }
        .onChange(of: selectedFilter) { _, newValue in
            if newValue == .deleted && viewModel.deletedTransactions.isEmpty && !viewModel.isLoadingDeleted {
                Task { await viewModel.loadDeletedTransactions() }
            }
        }
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .addTransaction:
                AddTransactionSheet(onSave: {
                    Task { await viewModel.loadTransactions() }
                })
            case .editTransaction(let transaction):
                EditTransactionSheet(transaction: transaction, onUpdate: {
                    Task {
                        await viewModel.loadTransactions()
                        if selectedFilter == .deleted {
                            await viewModel.loadDeletedTransactions()
                        }
                    }
                })
            case .categorizeTransaction(let transaction):
                CategorizeTransactionSheet(transaction: transaction) { budgetItemId in
                    await viewModel.categorizeTransaction(transactionId: transaction.id, budgetItemId: budgetItemId)
                }
            case .splitTransaction(let transaction):
                SplitTransactionSheet(
                    transaction: transaction,
                    existingSplits: transaction.splits ?? [],
                    onComplete: {
                        Task { await viewModel.loadTransactions() }
                    }
                )
            }
        }
    }

    // MARK: - Current Tab Data

    private var isCurrentTabLoading: Bool {
        switch selectedFilter {
        case .uncategorized, .tracked:
            return viewModel.isLoading
        case .deleted:
            return viewModel.isLoadingDeleted
        }
    }

    private var currentTransactions: [Transaction] {
        switch selectedFilter {
        case .uncategorized:
            // Only show uncategorized transactions from Teller sync (±7 days)
            return viewModel.uncategorizedTransactions.filter { $0.budgetItemId == nil && !$0.isDeleted }
        case .tracked:
            // Show all categorized transactions (no date filtering)
            return viewModel.categorizedTransactions.filter { $0.budgetItemId != nil }
        case .deleted:
            return viewModel.deletedTransactions
        }
    }

    // MARK: - Transaction List

    private var transactionList: some View {
        List {
            ForEach(groupedByDate, id: \.key) { date, transactions in
                Section(header: Text(formatDate(date))) {
                    ForEach(transactions) { transaction in
                        TransactionRow(transaction: transaction)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if transaction.isSplit {
                                    activeSheet = .splitTransaction(transaction)
                                } else {
                                    activeSheet = .editTransaction(transaction)
                                }
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if selectedFilter == .deleted {
                                    Button {
                                        Task {
                                            await viewModel.restoreTransaction(id: transaction.id)
                                        }
                                    } label: {
                                        Label("Restore", systemImage: "arrow.uturn.backward")
                                    }
                                    .tint(.green)
                                } else {
                                    Button(role: .destructive) {
                                        Task {
                                            await viewModel.deleteTransaction(id: transaction.id)
                                        }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                if selectedFilter == .uncategorized {
                                    if let suggestedId = transaction.suggestedBudgetItemId {
                                        Button {
                                            Task {
                                                await viewModel.categorizeTransaction(
                                                    transactionId: transaction.id,
                                                    budgetItemId: suggestedId
                                                )
                                            }
                                        } label: {
                                            Label("Quick Assign", systemImage: "sparkles")
                                        }
                                        .tint(.blue)
                                    }

                                    Button {
                                        activeSheet = .categorizeTransaction(transaction)
                                    } label: {
                                        Label("Categorize", systemImage: "folder")
                                    }
                                    .tint(.orange)

                                    Button {
                                        activeSheet = .splitTransaction(transaction)
                                    } label: {
                                        Label("Split", systemImage: "arrow.triangle.branch")
                                    }
                                    .tint(.purple)
                                }
                            }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var groupedByDate: [(key: Date, value: [Transaction])] {
        let grouped = Dictionary(grouping: currentTransactions) { transaction in
            Calendar.current.startOfDay(for: transaction.date)
        }
        return grouped.sorted { $0.key > $1.key }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label(emptyStateTitle, systemImage: emptyStateIcon)
        } description: {
            Text(emptyStateMessage)
        }
    }

    private var emptyStateTitle: String {
        switch selectedFilter {
        case .uncategorized: return "All Categorized"
        case .tracked: return "No Tracked Transactions"
        case .deleted: return "No Deleted Transactions"
        }
    }

    private var emptyStateIcon: String {
        switch selectedFilter {
        case .uncategorized: return "checkmark.circle"
        case .tracked: return "list.bullet"
        case .deleted: return "trash.slash"
        }
    }

    private var emptyStateMessage: String {
        switch selectedFilter {
        case .uncategorized: return "All your transactions have been categorized"
        case .tracked: return "No transactions assigned to budget items yet"
        case .deleted: return "No deleted transactions this month"
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}

// MARK: - Filter Enum

enum TransactionFilter: CaseIterable {
    case uncategorized
    case tracked
    case deleted

    var title: String {
        switch self {
        case .uncategorized: return "New"
        case .tracked: return "Tracked"
        case .deleted: return "Deleted"
        }
    }
}

// MARK: - Transaction Row

struct TransactionRow: View {
    let transaction: Transaction

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(transaction.merchant ?? transaction.description)
                    .font(.body)
                    .lineLimit(1)

                if transaction.isDeleted {
                    Label("Deleted", systemImage: "trash")
                        .font(.caption)
                        .foregroundStyle(.red)
                } else if transaction.isSplit {
                    Label("Split", systemImage: "arrow.triangle.branch")
                        .font(.caption)
                        .foregroundStyle(.purple)
                } else if transaction.budgetItemId == nil, transaction.suggestedBudgetItemId != nil {
                    Text("Swipe right to categorize")
                        .font(.caption)
                        .foregroundStyle(.blue)
                }
            }

            Spacer()

            Text(transaction.displayAmount)
                .font(.body)
                .fontWeight(.medium)
                .foregroundStyle(transaction.type == .income ? .green : .primary)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Categorize Transaction Sheet

struct CategorizeTransactionSheet: View {
    let transaction: Transaction
    let onCategorize: (Int) async -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var budgetVM = BudgetViewModel()
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Group {
                if budgetVM.isLoading {
                    ProgressView("Loading categories...")
                } else if let budget = budgetVM.budget {
                    List {
                        ForEach(budget.sortedCategoryKeys, id: \.self) { key in
                            if let category = budget.categories[key] {
                                Section(category.displayName) {
                                    ForEach(category.items) { item in
                                        Button {
                                            isSaving = true
                                            Task {
                                                await onCategorize(item.id)
                                                dismiss()
                                            }
                                        } label: {
                                            HStack {
                                                Text(item.name)
                                                    .foregroundStyle(.primary)
                                                Spacer()
                                                VStack(alignment: .trailing, spacing: 2) {
                                                    Text(formatCurrency(item.remaining))
                                                        .font(.caption)
                                                        .foregroundStyle(.secondary)
                                                    Text("remaining")
                                                        .font(.caption2)
                                                        .foregroundStyle(.tertiary)
                                                }
                                            }
                                        }
                                        .disabled(isSaving)
                                    }
                                }
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                } else if let error = budgetVM.error {
                    ContentUnavailableView {
                        Label("Failed to Load", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(error)
                    } actions: {
                        Button("Retry") {
                            Task { await budgetVM.loadBudget() }
                        }
                    }
                } else {
                    ContentUnavailableView("No Budget", systemImage: "dollarsign.circle")
                }
            }
            .navigationTitle("Categorize")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .task {
                await budgetVM.loadBudget()
            }
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
        TransactionsView(viewModel: TransactionsViewModel())
    }
}
