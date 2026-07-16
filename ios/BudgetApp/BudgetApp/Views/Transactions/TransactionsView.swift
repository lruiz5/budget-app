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

    // Cached filter results — recomputed via onChange instead of on every render
    @State private var cachedGrouped: [(key: Date, value: [Transaction])] = []
    @State private var cachedTabCount: Int = 0

    // Single-open coordination for custom swipe rows
    @State private var activeSwipeItemId: Int?

    private static let utcCalendar: Calendar = {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        return cal
    }()

    // Split into layered computed properties so Swift's type-checker can handle each independently.

    var body: some View {
        withSheet
    }

    // Layer 4: sheet presentation
    private var withSheet: some View {
        withFilterObservers
            .sheet(item: $activeSheet) { sheet in
                sheetContent(for: sheet)
            }
    }

    // Layer 3: filter-state onChange observers
    private var withFilterObservers: some View {
        withDataObservers
            .onChange(of: filterType) { _, _ in recomputeFiltered() }
            .onChange(of: filterCategoryIds) { _, _ in recomputeFiltered() }
            .onChange(of: filterMinAmount) { _, _ in recomputeFiltered() }
            .onChange(of: filterMaxAmount) { _, _ in recomputeFiltered() }
            .onChange(of: filterAccountIds) { _, _ in recomputeFiltered() }
    }

    // Layer 2: data + lifecycle observers
    private var withDataObservers: some View {
        coreContent
            .onAppear { recomputeFiltered() }
            .onChange(of: selectedFilter) { _, newValue in
                if newValue == .deleted && viewModel.deletedTransactions.isEmpty && !viewModel.isLoadingDeleted {
                    Task { await viewModel.loadDeletedTransactions() }
                }
                recomputeFiltered()
            }
            .onChange(of: viewModel.budgetCategories.map(\.id)) { _, _ in
                filterCategoryIds.removeAll()
            }
            .onChange(of: viewModel.transactions) { _, _ in recomputeFiltered() }
            .onChange(of: viewModel.deletedTransactions) { _, _ in recomputeFiltered() }
            .onChange(of: searchText) { _, _ in recomputeFiltered() }
    }

    // Layer 1: VStack content + toolbar + core modifiers
    private var coreContent: some View {
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
                TransactionListSkeleton()
            } else if cachedGrouped.isEmpty {
                emptyStateView
            } else {
                transactionList
            }
        }
        .background(Color.appSurfaceSecondary)
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
                    syncButtonLabel
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
    }

    // MARK: - Toolbar / Sheet Helpers (extracted to aid Swift type-checker)

    @ViewBuilder
    private var syncButtonLabel: some View {
        if viewModel.isSyncing {
            ProgressView()
        } else {
            Image(systemName: "arrow.triangle.2.circlepath")
        }
    }

    @ViewBuilder
    private func sheetContent(for sheet: TransactionActiveSheet) -> some View {
        switch sheet {
        case .addTransaction:
            AddTransactionSheet(onSave: {
                Task { await viewModel.loadTransactions(skipCache: true) }
            })
        case .editTransaction(let transaction):
            EditTransactionSheet(transaction: transaction, onUpdate: {
                Task {
                    await viewModel.loadTransactions(skipCache: true)
                    if selectedFilter == .deleted {
                        await viewModel.loadDeletedTransactions()
                    }
                }
            }, onSplit: {
                activeSheet = .splitTransaction(transaction)
            })
        case .categorizeTransaction(let transaction):
            CategorizeTransactionSheet(transaction: transaction, onCategorize: { budgetItemId in
                await viewModel.categorizeTransaction(transactionId: transaction.id, budgetItemId: budgetItemId)
            }, onSplit: {
                activeSheet = .splitTransaction(transaction)
            })
        case .splitTransaction(let transaction):
            SplitTransactionSheet(
                transaction: transaction,
                existingSplits: transaction.splits ?? [],
                onComplete: {
                    Task { await viewModel.loadTransactions(skipCache: true) }
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

    // MARK: - Current Tab Data

    private var isCurrentTabLoading: Bool {
        switch selectedFilter {
        case .uncategorized, .tracked:
            return viewModel.isLoading
        case .deleted:
            return viewModel.isLoadingDeleted
        }
    }

    // MARK: - Filter Pipeline (runs only when data or filters change, not on every render)

    private func recomputeFiltered() {
        // Tab filter
        let tabData: [Transaction]
        switch selectedFilter {
        case .uncategorized:
            tabData = viewModel.uncategorizedTransactions.filter { $0.budgetItemId == nil && !$0.isDeleted }
        case .tracked:
            tabData = viewModel.categorizedTransactions.filter { $0.budgetItemId != nil || $0.isSplit }
        case .deleted:
            tabData = viewModel.deletedTransactions
        }
        cachedTabCount = tabData.count

        var result = tabData

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

        // Group by date using shared UTC calendar and sort descending
        let grouped = Dictionary(grouping: result) { transaction in
            Self.utcCalendar.startOfDay(for: transaction.date)
        }
        cachedGrouped = grouped.sorted { $0.key > $1.key }
    }

    // MARK: - Transaction List

    private var transactionList: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 8) {
                ForEach(cachedGrouped, id: \.key) { date, transactions in
                    dateHeader(date)
                    transactionGroupCard(transactions)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 16)
        }
        .background(Color.appSurfaceSecondary)
    }

    private func dateHeader(_ date: Date) -> some View {
        Text(formatDate(date))
            .font(.outfitCaption)
            .foregroundStyle(.secondary)
            .padding(.top, 12)
            .padding(.leading, 4)
    }

    private func transactionGroupCard(_ transactions: [Transaction]) -> some View {
        VStack(spacing: 0) {
            ForEach(Array(transactions.enumerated()), id: \.element.id) { index, transaction in
                transactionSwipeRow(transaction)

                if index < transactions.count - 1 {
                    Divider()
                        .padding(.leading, 16)
                }
            }
        }
        .cardStyle()
    }

    private func transactionSwipeRow(_ transaction: Transaction) -> some View {
        SwipeActionsRow(
            itemId: transaction.id,
            activeSwipeItemId: $activeSwipeItemId,
            leadingActions: leadingActions(for: transaction),
            trailingActions: trailingActions(for: transaction)
        ) {
            TransactionRow(transaction: transaction, budgetItemName: transaction.isSplit
                ? transaction.splits?.compactMap { viewModel.budgetItemNameMap[$0.budgetItemId] }.joined(separator: ", ")
                : viewModel.budgetItemNameMap[transaction.budgetItemId ?? -1])
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .contentShape(Rectangle())
                .onTapGesture {
                    if transaction.isSplit {
                        activeSheet = .splitTransaction(transaction)
                    } else {
                        activeSheet = .editTransaction(transaction)
                    }
                }
        }
    }

    private func trailingActions(for transaction: Transaction) -> [SwipeRowAction] {
        if selectedFilter == .deleted {
            return [SwipeRowAction(icon: "arrow.uturn.backward", tint: .appPrimary) {
                Task { await viewModel.restoreTransaction(id: transaction.id) }
            }]
        }
        return [SwipeRowAction(icon: "trash.fill", tint: .appDanger) {
            Task { await viewModel.deleteTransaction(id: transaction.id) }
        }]
    }

    private func leadingActions(for transaction: Transaction) -> [SwipeRowAction] {
        guard selectedFilter == .uncategorized else { return [] }
        var actions: [SwipeRowAction] = []
        if let suggestedId = transaction.suggestedBudgetItemId {
            actions.append(SwipeRowAction(icon: "sparkles", tint: .appInfo) {
                Task {
                    await viewModel.categorizeTransaction(
                        transactionId: transaction.id,
                        budgetItemId: suggestedId
                    )
                }
            })
        }
        actions.append(SwipeRowAction(icon: "folder", tint: .appAccentOrange) {
            activeSheet = .categorizeTransaction(transaction)
        })
        actions.append(SwipeRowAction(icon: "arrow.triangle.branch", tint: .appAccentPurple) {
            activeSheet = .splitTransaction(transaction)
        })
        return actions
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
                .font(.outfitCaption)
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

    private var emptyStateView: some View {
        Group {
            if cachedTabCount > 0 {
                // Filters produced zero results but tab has data
                ContentUnavailableView {
                    Label("No Matching Transactions", systemImage: "magnifyingglass")
                } description: {
                    Text("Try adjusting your search or filters")
                } actions: {
                    Button("Clear Filters") {
                        clearAllFilters()
                    }
                    .buttonStyle(.appSecondary)
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
                HStack(spacing: 6) {
                    Text(transaction.merchant ?? transaction.description)
                        .font(.outfitBody)
                        .lineLimit(1)

                    if let tag = transaction.tagCategoryType, !tag.isEmpty {
                        Text(BudgetCategory.emojiForCategoryType(tag))
                            .font(.outfitCaption2)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(Color.appSurfaceSecondary)
                            .cornerRadius(4)
                    }
                }

                if transaction.isDeleted {
                    Label("Deleted", systemImage: "trash")
                        .font(.outfitCaption)
                        .foregroundStyle(Color.appDanger)
                } else if transaction.isSplit {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.branch")
                            .foregroundStyle(Color.appAccentPurple)
                        Text(budgetItemName ?? "Split")
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                    .font(.outfitCaption)
                } else if let itemName = budgetItemName {
                    Text(itemName)
                        .font(.outfitCaption)
                        .foregroundStyle(.secondary)
                } else if transaction.budgetItemId == nil, transaction.suggestedBudgetItemId != nil {
                    Text("Swipe right to categorize")
                        .font(.outfitCaption)
                        .foregroundStyle(Color.appInfo)
                }
            }

            Spacer()

            Text(transaction.displayAmount)
                .font(.outfitBody)
                .fontWeight(.medium)
                .foregroundStyle(transaction.type == .income ? Color.income : Color.appTextPrimary)
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Categorize Transaction Sheet

struct CategorizeTransactionSheet: View {
    let transaction: Transaction
    let onCategorize: (Int) async -> Void
    var onSplit: (() -> Void)?

    @Environment(\.dismiss) private var dismiss
    @StateObject private var budgetVM = BudgetViewModel()
    @State private var isSaving = false

    var body: some View {
        NavigationStack {
            Group {
                if budgetVM.isLoading {
                    SheetListSkeleton()
                        .background(Color(.systemGroupedBackground))
                } else if let budget = budgetVM.budget {
                    List {
                        if let onSplit {
                            Section {
                                Button {
                                    dismiss()
                                    onSplit()
                                } label: {
                                    Label("Split Transaction", systemImage: "arrow.triangle.branch")
                                        .foregroundStyle(Color.appAccentPurple)
                                }
                            }
                        }
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
                                                        .font(.outfitCaption)
                                                        .foregroundStyle(.secondary)
                                                    Text("remaining")
                                                        .font(.outfitCaption2)
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
                    .scrollContentBackground(.hidden)
                    .background(Color.appSurfaceSecondary)
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
                .font(.outfitCaption)
                .lineLimit(1)
            Button {
                onRemove()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.outfitCaption)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Color.appPrimaryLight)
        .foregroundStyle(Color.appPrimary)
        .clipShape(Capsule())
    }
}

#Preview {
    NavigationStack {
        TransactionsView(viewModel: TransactionsViewModel())
    }
}
