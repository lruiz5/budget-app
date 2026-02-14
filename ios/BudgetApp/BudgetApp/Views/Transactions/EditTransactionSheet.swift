import SwiftUI

struct EditTransactionSheet: View {
    let transaction: Transaction
    let onUpdate: () -> Void
    var onTransactionUpdated: ((Transaction) -> Void)? = nil
    var onTransactionDeleted: ((Int) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var editedDescription: String
    @State private var editedAmount: String
    @State private var selectedDate: Date
    @State private var transactionType: TransactionType
    @State private var editedMerchant: String
    @State private var selectedBudgetItemId: Int?
    @State private var isNonEarned: Bool
    @State private var isSaving = false
    @State private var showDeleteConfirmation = false
    @State private var showUnsplitConfirmation = false
    @State private var saveError: String?

    @StateObject private var budgetVM = BudgetViewModel()

    init(transaction: Transaction, onUpdate: @escaping () -> Void, onTransactionUpdated: ((Transaction) -> Void)? = nil, onTransactionDeleted: ((Int) -> Void)? = nil) {
        self.transaction = transaction
        self.onUpdate = onUpdate
        self.onTransactionUpdated = onTransactionUpdated
        self.onTransactionDeleted = onTransactionDeleted
        self._editedDescription = State(initialValue: transaction.description)
        self._editedAmount = State(initialValue: "\(transaction.amount)")
        self._selectedDate = State(initialValue: transaction.date)
        self._transactionType = State(initialValue: transaction.type)
        self._editedMerchant = State(initialValue: transaction.merchant ?? "")
        self._selectedBudgetItemId = State(initialValue: transaction.budgetItemId)
        self._isNonEarned = State(initialValue: transaction.isNonEarned)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Transaction Details") {
                    Picker("Type", selection: $transactionType) {
                        Text("Expense").tag(TransactionType.expense)
                        Text("Income").tag(TransactionType.income)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: transactionType) { _, newType in
                        if newType != .income { isNonEarned = false }
                    }

                    if transactionType == .income {
                        Toggle(isOn: $isNonEarned) {
                            Label("Non-earned income", systemImage: "gift")
                        }
                    }

                    HStack {
                        Text("$")
                        TextField("Amount", text: $editedAmount)
                            .keyboardType(.decimalPad)
                    }

                    TextField("Description", text: $editedDescription)

                    TextField("Merchant (optional)", text: $editedMerchant)

                    DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
                }

                if transaction.isSplit {
                    Section("Split Transaction") {
                        Label("This transaction is split across multiple budget items", systemImage: "arrow.triangle.branch")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        if let splits = transaction.splits {
                            ForEach(splits) { split in
                                HStack {
                                    Text(split.description ?? "Split")
                                    Spacer()
                                    Text(formatCurrency(split.amount))
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }

                    Section {
                        Button(role: .destructive) {
                            showUnsplitConfirmation = true
                        } label: {
                            HStack {
                                Spacer()
                                Label("Remove Splits", systemImage: "arrow.uturn.backward")
                                Spacer()
                            }
                        }
                    }
                } else {
                    Section("Category") {
                        if budgetVM.isLoading {
                            HStack {
                                Spacer()
                                ProgressView()
                                Spacer()
                            }
                        } else if let error = budgetVM.error {
                            VStack(spacing: 8) {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.red)
                                Button("Retry") {
                                    Task { await budgetVM.loadBudget() }
                                }
                            }
                        } else if let budget = budgetVM.budget {
                            // "None" option to uncategorize
                            Button {
                                selectedBudgetItemId = nil
                            } label: {
                                HStack {
                                    Text("Uncategorized")
                                        .foregroundStyle(.secondary)
                                    Spacer()
                                    if selectedBudgetItemId == nil {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.green)
                                    }
                                }
                            }

                            ForEach(budget.sortedCategoryKeys, id: \.self) { key in
                                if let category = budget.categories[key] {
                                    ForEach(category.items) { item in
                                        Button {
                                            selectedBudgetItemId = item.id
                                        } label: {
                                            HStack {
                                                Text(category.categoryEmoji)
                                                Text(item.name)
                                                    .foregroundStyle(.primary)
                                                Spacer()
                                                if selectedBudgetItemId == item.id {
                                                    Image(systemName: "checkmark")
                                                        .foregroundStyle(.green)
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                Section {
                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        HStack {
                            Spacer()
                            Label("Delete Transaction", systemImage: "trash")
                            Spacer()
                        }
                    }
                }
            }
            .navigationTitle("Edit Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveTransaction()
                    }
                    .disabled(editedAmount.isEmpty || editedDescription.isEmpty || isSaving)
                }
            }
            .task {
                await budgetVM.loadBudget()
            }
            .confirmationDialog("Remove Splits", isPresented: $showUnsplitConfirmation) {
                Button("Remove Splits", role: .destructive) {
                    Task {
                        do {
                            _ = try await TransactionService.shared.deleteSplits(parentTransactionId: transaction.id)
                            onUpdate()
                            dismiss()
                        } catch {
                            saveError = error.localizedDescription
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will remove all splits and return the transaction to uncategorized.")
            }
            .confirmationDialog("Delete Transaction", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task {
                        do {
                            _ = try await TransactionService.shared.deleteTransaction(id: transaction.id)
                            onTransactionDeleted?(transaction.id)
                            onUpdate()
                            dismiss()
                        } catch {
                            saveError = error.localizedDescription
                        }
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to delete this transaction?")
            }
            .alert("Error", isPresented: Binding(
                get: { saveError != nil },
                set: { if !$0 { saveError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveError ?? "")
            }
        }
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }

    private func saveTransaction() {
        guard let amountDecimal = Decimal(string: editedAmount) else { return }

        isSaving = true
        Task {
            do {
                let request = UpdateTransactionRequest(
                    id: transaction.id,
                    budgetItemId: selectedBudgetItemId,
                    date: selectedDate,
                    description: editedDescription,
                    amount: amountDecimal,
                    type: transactionType,
                    merchant: editedMerchant.isEmpty ? nil : editedMerchant,
                    isNonEarned: isNonEarned
                )
                let updated = try await TransactionService.shared.updateTransaction(request)
                await MainActor.run {
                    onTransactionUpdated?(updated)
                    onUpdate()
                    dismiss()
                }
            } catch {
                saveError = error.localizedDescription
                isSaving = false
            }
        }
    }
}

#Preview {
    EditTransactionSheet(
        transaction: Transaction(
            id: 1,
            budgetItemId: nil,
            description: "Grocery Store",
            amount: 85.50,
            type: .expense,
            merchant: "Whole Foods"
        ),
        onUpdate: {}
    )
}
