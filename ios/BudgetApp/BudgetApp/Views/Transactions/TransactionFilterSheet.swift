import SwiftUI

// MARK: - Transaction Type Filter

enum TransactionTypeFilter: String, CaseIterable {
    case all = "All"
    case income = "Income"
    case expense = "Expense"
}

// MARK: - Filter Sheet

struct TransactionFilterSheet: View {
    @Binding var filterType: TransactionTypeFilter
    @Binding var filterCategoryIds: Set<Int>
    @Binding var filterMinAmount: String
    @Binding var filterMaxAmount: String
    @Binding var filterAccountIds: Set<Int>

    let budgetCategories: [BudgetCategory]
    let linkedAccounts: [LinkedAccount]
    let selectedTab: TransactionFilter

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                // MARK: Type Filter
                Section("Type") {
                    Picker("Transaction Type", selection: $filterType) {
                        ForEach(TransactionTypeFilter.allCases, id: \.self) { type in
                            Text(type.rawValue).tag(type)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                // MARK: Category Filter (only on Tracked tab)
                if selectedTab == .tracked && !budgetCategories.isEmpty {
                    Section("Category") {
                        ForEach(budgetCategories) { category in
                            Button {
                                toggleCategory(category.id)
                            } label: {
                                HStack {
                                    Text(category.displayName)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if filterCategoryIds.contains(category.id) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.green)
                                    }
                                }
                            }
                        }
                    }
                }

                // MARK: Amount Range
                Section("Amount Range") {
                    HStack {
                        Text("Min $")
                            .foregroundStyle(.secondary)
                        TextField("0", text: $filterMinAmount)
                            .keyboardType(.decimalPad)
                    }
                    HStack {
                        Text("Max $")
                            .foregroundStyle(.secondary)
                        TextField("Any", text: $filterMaxAmount)
                            .keyboardType(.decimalPad)
                    }
                    if let min = Decimal(string: filterMinAmount),
                       let max = Decimal(string: filterMaxAmount),
                       min > max {
                        Text("Min is greater than max — both still apply independently")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }

                // MARK: Account Filter
                Section("Account") {
                    // Manual entry option (linkedAccountId == nil)
                    Button {
                        toggleAccount(-1) // sentinel for manual
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("Manual Entry")
                                    .foregroundStyle(.primary)
                                Text("Transactions added manually")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if filterAccountIds.contains(-1) {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.green)
                            }
                        }
                    }

                    if linkedAccounts.isEmpty {
                        Text("No linked accounts")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(linkedAccounts) { account in
                            Button {
                                toggleAccount(account.id)
                            } label: {
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(account.displayName)
                                            .foregroundStyle(.primary)
                                        Text(account.institutionName)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if filterAccountIds.contains(account.id) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.green)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Reset All") {
                        filterType = .all
                        filterCategoryIds.removeAll()
                        filterMinAmount = ""
                        filterMaxAmount = ""
                        filterAccountIds.removeAll()
                    }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func toggleCategory(_ id: Int) {
        if filterCategoryIds.contains(id) {
            filterCategoryIds.remove(id)
        } else {
            filterCategoryIds.insert(id)
        }
    }

    private func toggleAccount(_ id: Int) {
        if filterAccountIds.contains(id) {
            filterAccountIds.remove(id)
        } else {
            filterAccountIds.insert(id)
        }
    }
}
