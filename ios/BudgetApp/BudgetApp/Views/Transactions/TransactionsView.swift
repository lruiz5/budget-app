import SwiftUI

// MARK: - Active Sheet Enum (single .sheet pattern to avoid SwiftUI multi-sheet bugs)

enum TransactionActiveSheet: Identifiable {
    case addTransaction
    case editTransaction(Transaction)
    case categorizeTransaction(Transaction)
    case splitTransaction(Transaction)
    case filterOptions

    var id: String {
        switch self {
        case .addTransaction: return "add"
        case .editTransaction(let t): return "edit-\(t.id)"
        case .categorizeTransaction(let t): return "categorize-\(t.id)"
        case .splitTransaction(let t): return "split-\(t.id)"
        case .filterOptions: return "filters"
        }
    }
}

struct TransactionsView: View {
    @ObservedObject var viewModel: TransactionsViewModel
    @State private var selectedFilter: TransactionFilter = .uncategorized
    @State private var activeSheet: TransactionActiveSheet?

    // Search & filter state
    @State private var searchText = ""
    @State private var filterType: TransactionTypeFilter = .all
    @State private var filterCategoryIds: Set<Int> = []
    @State private var filterMinAmount = ""
    @State private var filterMaxAmount = ""
    @State private var filterAccountIds: Set<Int> = []

    var body: some View {
        VStack(spacing: 0) {
            // Tab Picker
            Picker("Filter", selection: $selectedFilter) {
                ForEach(TransactionFilter.allCases, id: \.self) { filter in
                    Text(filter.title).tag(filter)
                }
            }
            .pickerStyle(.segmented)
            .padding()

            // Filter Chip Bar
            if hasActiveFilters {
                filterChipBar
            }

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
        .searchable(text: $searchText, prompt: "Search transactions")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button {
                    activeSheet = .filterOptions
                } label: {
                    Image(systemName: hasActiveFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
                }
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.syncAllAccounts() }
                } label: {
                    if viewModel.isSyncing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.triangle.2.circlepath")
                    }
                }
                .disabled(viewModel.isSyncing)
            }

            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    activeSheet = .addTransaction
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .toast(
            isPresented: $viewModel.showToast,
            message: viewModel.toastMessage ?? "",
            isError: viewModel.isToastError
        )
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
        .onChange(of: viewModel.budgetCategories.map(\.id)) { _, _ in
            // Clear category filter on month change (category IDs differ per month)
            filterCategoryIds.removeAll()
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
            case .filterOptions:
                TransactionFilterSheet(
                    filterType: $filterType,
                    filterCategoryIds: $filterCategoryIds,
                    filterMinAmount: $filterMinAmount,
                    filterMaxAmount: $filterMaxAmount,
                    filterAccountIds: $filterAccountIds,
                    budgetCategories: viewModel.budgetCategories,
                    linkedAccounts: viewModel.linkedAccounts,
                    selectedTab: selectedFilter
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

    private var tabFilteredTransactions: [Transaction] {
        switch selectedFilter {
        case .uncategorized:
            return viewModel.uncategorizedTransactions.filter { $0.budgetItemId == nil && !$0.isDeleted }
        case .tracked:
            return viewModel.categorizedTransactions.filter { $0.budgetItemId != nil || $0.isSplit }
        case .deleted:
            return viewModel.deletedTransactions
        }
    }

    private var currentTransactions: [Transaction] {
        var result = tabFilteredTransactions

        // Text search (merchant, description, amount)
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter { txn in
                txn.description.lowercased().contains(query) ||
                (txn.merchant?.lowercased().contains(query) ?? false) ||
                txn.displayAmount.contains(query)
            }
        }

        // Type filter
        if filterType != .all {
            let matchType: TransactionType = filterType == .income ? .income : .expense
            result = result.filter { $0.type == matchType }
        }

        // Category filter (only on Tracked tab — others lack budgetItemId)
        if selectedFilter == .tracked && !filterCategoryIds.isEmpty {
            let itemIds = Set(viewModel.budgetCategories
                .filter { filterCategoryIds.contains($0.id) }
                .flatMap { $0.items.map { $0.id } })
            result = result.filter { txn in
                guard let itemId = txn.budgetItemId else { return false }
                return itemIds.contains(itemId)
            }
        }

        // Amount range
        if let min = Decimal(string: filterMinAmount) {
            result = result.filter { $0.amount >= min }
        }
        if let max = Decimal(string: filterMaxAmount) {
            result = result.filter { $0.amount <= max }
        }

        // Account filter (-1 sentinel = manual/nil linkedAccountId)
        if !filterAccountIds.isEmpty {
            result = result.filter { txn in
                if let accountId = txn.linkedAccountId {
                    return filterAccountIds.contains(accountId)
                } else {
                    return filterAccountIds.contains(-1)
                }
            }
        }

        return result
    }

    // MARK: - Budget Item Lookup

    private var budgetItemNameMap: [Int: String] {
        var map: [Int: String] = [:]
        for category in viewModel.budgetCategories {
            for item in category.items {
                map[item.id] = item.name
            }
        }
        return map
    }

    // MARK: - Transaction List

    private var transactionList: some View {
        List {
            ForEach(groupedByDate, id: \.key) { date, transactions in
                Section(header: Text(formatDate(date))) {
                    ForEach(transactions) { transaction in
                        TransactionRow(transaction: transaction, budgetItemName: transaction.isSplit
                            ? transaction.splits?.compactMap { budgetItemNameMap[$0.budgetItemId] }.joined(separator: ", ")
                            : budgetItemNameMap[transaction.budgetItemId ?? -1])
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
        var utcCalendar = Calendar.current
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let grouped = Dictionary(grouping: currentTransactions) { transaction in
            utcCalendar.startOfDay(for: transaction.date)
        }
        return grouped.sorted { $0.key > $1.key }
    }

    // MARK: - Filter Chip Bar

    private var hasActiveFilters: Bool {
        filterType != .all ||
        !filterCategoryIds.isEmpty ||
        !filterMinAmount.isEmpty ||
        !filterMaxAmount.isEmpty ||
        !filterAccountIds.isEmpty
    }

    private var activeFilterCount: Int {
        var count = 0
        if filterType != .all { count += 1 }
        if !filterCategoryIds.isEmpty { count += 1 }
        if !filterMinAmount.isEmpty || !filterMaxAmount.isEmpty { count += 1 }
        if !filterAccountIds.isEmpty { count += 1 }
        return count
    }

    private var filterChipBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if filterType != .all {
                    FilterChip(label: filterType.rawValue) {
                        filterType = .all
                    }
                }

                if !filterCategoryIds.isEmpty {
                    let names = viewModel.budgetCategories
                        .filter { filterCategoryIds.contains($0.id) }
                        .map { $0.name }
                    let label = names.count == 1 ? names[0] : "\(names.count) categories"
                    FilterChip(label: label) {
                        filterCategoryIds.removeAll()
                    }
                }

                if !filterMinAmount.isEmpty || !filterMaxAmount.isEmpty {
                    let label: String = {
                        if !filterMinAmount.isEmpty && !filterMaxAmount.isEmpty {
                            return "$\(filterMinAmount)–$\(filterMaxAmount)"
                        } else if !filterMinAmount.isEmpty {
                            return "$\(filterMinAmount)+"
                        } else {
                            return "Up to $\(filterMaxAmount)"
                        }
                    }()
                    FilterChip(label: label) {
                        filterMinAmount = ""
                        filterMaxAmount = ""
                    }
                }

                if !filterAccountIds.isEmpty {
                    let names: [String] = filterAccountIds.compactMap { id in
                        if id == -1 { return "Manual" }
                        return viewModel.linkedAccounts.first { $0.id == id }?.displayName
                    }
                    let label = names.count == 1 ? names[0] : "\(names.count) accounts"
                    FilterChip(label: label) {
                        filterAccountIds.removeAll()
                    }
                }

                Button("Clear All") {
                    clearAllFilters()
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(.horizontal)
            .padding(.bottom, 8)
        }
    }

    private func clearAllFilters() {
        searchText = ""
        filterType = .all
        filterCategoryIds.removeAll()
        filterMinAmount = ""
        filterMaxAmount = ""
        filterAccountIds.removeAll()
    }

    // MARK: - Empty State

    private var hasTabData: Bool {
        !tabFilteredTransactions.isEmpty
    }

    private var emptyStateView: some View {
        Group {
            if hasTabData {
                // Filters produced zero results but tab has data
                ContentUnavailableView {
                    Label("No Matching Transactions", systemImage: "magnifyingglass")
                } description: {
                    Text("Try adjusting your search or filters")
                } actions: {
                    Button("Clear Filters") {
                        clearAllFilters()
                    }
                    .buttonStyle(.bordered)
                }
            } else {
                ContentUnavailableView {
                    Label(emptyStateTitle, systemImage: emptyStateIcon)
                } description: {
                    Text(emptyStateMessage)
                }
            }
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
        Formatters.dateMediumUTC.string(from: date)
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
    var budgetItemName: String? = nil

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
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.branch")
                            .foregroundStyle(.purple)
                        Text(budgetItemName ?? "Split")
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .font(.caption)
                } else if let itemName = budgetItemName {
                    Text(itemName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
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
        Formatters.currency.string(from: value as NSNumber) ?? "$0.00"
    }
}

// MARK: - Filter Chip

struct FilterChip: View {
    let label: String
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            Text(label)
                .font(.caption)
                .lineLimit(1)
            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.green.opacity(0.15))
        .foregroundStyle(.green)
        .clipShape(Capsule())
    }
}

#Preview {
    NavigationStack {
        TransactionsView(viewModel: TransactionsViewModel())
    }
}
