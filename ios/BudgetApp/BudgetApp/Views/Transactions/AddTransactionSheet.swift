import SwiftUI

struct AddTransactionSheet: View {
    var preSelectedBudgetItemId: Int? = nil
    var onTransactionCreated: ((Transaction) -> Void)? = nil
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var description = ""
    @State private var amount = ""
    @State private var selectedDate = Date()
    @State private var transactionType: TransactionType = .expense
    @State private var merchant = ""
    @State private var selectedBudgetItemId: Int?
    @State private var isSaving = false
    @State private var error: String?

    @StateObject private var budgetVM = BudgetViewModel()

    var body: some View {
        NavigationStack {
            Form {
                Section("Transaction Details") {
                    Picker("Type", selection: $transactionType) {
                        Text("Expense").tag(TransactionType.expense)
                        Text("Income").tag(TransactionType.income)
                    }
                    .pickerStyle(.segmented)

                    HStack {
                        Text("$")
                        TextField("Amount", text: $amount)
                            .keyboardType(.decimalPad)
                    }

                    TextField("Description (optional)", text: $description)

                    TextField("Merchant (optional)", text: $merchant)

                    DatePicker("Date", selection: $selectedDate, displayedComponents: .date)
                }

                Section("Category") {
                    if budgetVM.isLoading {
                        HStack {
                            Spacer()
                            ProgressView()
                            Spacer()
                        }
                    } else if let budget = budgetVM.budget {
                        ForEach(budget.sortedCategoryKeys, id: \.self) { key in
                            if let category = budget.categories[key], !category.items.isEmpty {
                                Section(category.displayName) {
                                    ForEach(category.items) { item in
                                        Button {
                                            selectedBudgetItemId = item.id
                                        } label: {
                                            HStack {
                                                Text(item.name)
                                                    .foregroundStyle(.primary)
                                                Spacer()
                                                Text(formatCurrency(item.remaining))
                                                    .font(.caption)
                                                    .foregroundStyle(.secondary)
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
            }
            .navigationTitle("Add Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveTransaction()
                    }
                    .disabled(amount.isEmpty || selectedBudgetItemId == nil || isSaving)
                }
            }
            .task {
                await budgetVM.loadBudget()
            }
            .onAppear {
                if let preSelected = preSelectedBudgetItemId {
                    selectedBudgetItemId = preSelected
                }
            }
            .alert("Error", isPresented: Binding(
                get: { error != nil },
                set: { if !$0 { error = nil } }
            )) {
                Button("OK") { error = nil }
            } message: {
                if let error {
                    Text(error)
                }
            }
        }
    }

    private func saveTransaction() {
        guard let budgetItemId = selectedBudgetItemId,
              let amountDecimal = Decimal(string: amount) else { return }

        // Use merchant as description fallback, matching web behavior
        let finalDescription = description.isEmpty
            ? (merchant.isEmpty ? "Manual transaction" : merchant)
            : description

        isSaving = true

        Task {
            do {
                let request = CreateTransactionRequest(
                    budgetItemId: budgetItemId,
                    date: selectedDate,
                    description: finalDescription,
                    amount: amountDecimal,
                    type: transactionType,
                    merchant: merchant.isEmpty ? nil : merchant
                )
                let created = try await TransactionService.shared.createTransaction(request)
                await MainActor.run {
                    onTransactionCreated?(created)
                    onSave()
                    dismiss()
                }
            } catch {
                self.error = error.localizedDescription
                isSaving = false
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
    AddTransactionSheet(onSave: {})
}
