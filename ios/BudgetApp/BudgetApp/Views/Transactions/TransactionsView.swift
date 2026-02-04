import SwiftUI

struct TransactionsView: View {
    @StateObject private var viewModel = TransactionsViewModel()
    @State private var selectedFilter: TransactionFilter = .uncategorized
    @State private var showAddTransaction = false
    @State private var selectedTransaction: Transaction?

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
            if viewModel.isLoading {
                Spacer()
                ProgressView("Loading transactions...")
                Spacer()
            } else if filteredTransactions.isEmpty {
                emptyStateView
            } else {
                transactionList
            }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showAddTransaction = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .refreshable {
            await viewModel.loadTransactions()
        }
        .task {
            await viewModel.loadTransactions()
        }
        .sheet(isPresented: $showAddTransaction) {
            AddTransactionSheet(onSave: {
                Task { await viewModel.loadTransactions() }
            })
        }
        .sheet(item: $selectedTransaction) { transaction in
            TransactionDetailSheet(transaction: transaction, onUpdate: {
                Task { await viewModel.loadTransactions() }
            })
        }
    }

    // MARK: - Filtered Transactions

    private var filteredTransactions: [Transaction] {
        switch selectedFilter {
        case .uncategorized:
            return viewModel.transactions.filter { $0.budgetItemId == nil && !$0.isDeleted }
        case .all:
            return viewModel.transactions.filter { !$0.isDeleted }
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
                                selectedTransaction = transaction
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.deleteTransaction(id: transaction.id)
                                    }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private var groupedByDate: [(key: Date, value: [Transaction])] {
        let grouped = Dictionary(grouping: filteredTransactions) { transaction in
            Calendar.current.startOfDay(for: transaction.date)
        }
        return grouped.sorted { $0.key > $1.key }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label(
                selectedFilter == .uncategorized ? "All Categorized" : "No Transactions",
                systemImage: selectedFilter == .uncategorized ? "checkmark.circle" : "list.bullet"
            )
        } description: {
            Text(selectedFilter == .uncategorized
                 ? "All your transactions have been categorized"
                 : "No transactions yet this month")
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
    case all

    var title: String {
        switch self {
        case .uncategorized: return "Uncategorized"
        case .all: return "All"
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

                if transaction.isSplit {
                    Label("Split", systemImage: "arrow.triangle.branch")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if let _ = transaction.suggestedBudgetItemId {
                    Text("Suggested category available")
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

// MARK: - Transaction Detail Sheet

struct TransactionDetailSheet: View {
    let transaction: Transaction
    let onUpdate: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Text("Transaction Detail")
                .navigationTitle("Transaction")
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
    }
}

#Preview {
    NavigationStack {
        TransactionsView()
    }
}
