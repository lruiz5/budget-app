import SwiftUI

struct AddTransactionSheet: View {
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var description = ""
    @State private var amount = ""
    @State private var selectedDate = Date()
    @State private var transactionType: TransactionType = .expense
    @State private var merchant = ""
    @State private var selectedBudgetItemId: Int?
    @State private var isSaving = false

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

                    TextField("Description", text: $description)

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
                            if let category = budget.categories[key] {
                                ForEach(category.items) { item in
                                    Button {
                                        selectedBudgetItemId = item.id
                                    } label: {
                                        HStack {
                                            Text(category.emoji ?? "📦")
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
        }
    }

    private func saveTransaction() {
        guard let budgetItemId = selectedBudgetItemId,
              let amountDecimal = Decimal(string: amount) else { return }

        isSaving = true

        Task {
            do {
                let request = CreateTransactionRequest(
                    budgetItemId: budgetItemId,
                    date: selectedDate,
                    description: description,
                    amount: amountDecimal,
                    type: transactionType,
                    merchant: merchant.isEmpty ? nil : merchant
                )
                _ = try await TransactionService.shared.createTransaction(request)
                await MainActor.run {
                    onSave()
                    dismiss()
                }
            } catch {
                // Handle error
                isSaving = false
            }
        }
    }
}

#Preview {
    AddTransactionSheet(onSave: {})
}
