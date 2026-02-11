import SwiftUI

struct OnboardingTransactionStep: View {
    @ObservedObject var viewModel: OnboardingViewModel

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(spacing: 20) {
                    Image(systemName: "creditcard.fill")
                        .font(.system(size: 40))
                        .foregroundStyle(.green)
                        .padding(.top, 24)

                    Text("Add Your First Transaction")
                        .font(.title2)
                        .fontWeight(.bold)

                    Text("Record a recent purchase to see how transactions work. You can skip this step if you prefer.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 16)

                    VStack(spacing: 16) {
                        // Type picker
                        Picker("Type", selection: $viewModel.transactionType) {
                            Text("Expense").tag(TransactionType.expense)
                            Text("Income").tag(TransactionType.income)
                        }
                        .pickerStyle(.segmented)

                        // Amount
                        HStack {
                            Text("$")
                                .foregroundStyle(.secondary)
                            TextField("Amount", text: $viewModel.transactionAmount)
                                .keyboardType(.decimalPad)
                        }
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground))
                        .cornerRadius(10)

                        // Date
                        DatePicker("Date", selection: $viewModel.transactionDate, displayedComponents: .date)
                            .padding(12)
                            .background(Color(.secondarySystemGroupedBackground))
                            .cornerRadius(10)

                        // Description
                        TextField("Description (e.g., Weekly groceries)", text: $viewModel.transactionDescription)
                            .padding(12)
                            .background(Color(.secondarySystemGroupedBackground))
                            .cornerRadius(10)

                        // Budget item picker
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Budget Item")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)

                            if viewModel.createdItems.isEmpty {
                                Text("No budget items created yet")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .padding(12)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color(.secondarySystemGroupedBackground))
                                    .cornerRadius(10)
                            } else {
                                Picker("Budget Item", selection: $viewModel.selectedBudgetItemId) {
                                    Text("Select an item").tag(nil as Int?)
                                    ForEach(viewModel.createdItems) { item in
                                        Text(item.name).tag(item.id as Int?)
                                    }
                                }
                                .pickerStyle(.menu)
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(.secondarySystemGroupedBackground))
                                .cornerRadius(10)
                            }
                        }

                        // Suggested transactions
                        if !suggestedTransactions.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Suggestions")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                ForEach(suggestedTransactions, id: \.description) { suggestion in
                                    Button {
                                        viewModel.transactionDescription = suggestion.description
                                        viewModel.transactionAmount = String(describing: suggestion.amount)
                                        viewModel.selectedBudgetItemId = suggestion.itemId
                                    } label: {
                                        HStack {
                                            Text(suggestion.description)
                                                .font(.caption)
                                            Spacer()
                                            Text(suggestion.amount.formatted())
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        .padding(10)
                                        .background(Color.green.opacity(0.08))
                                        .cornerRadius(8)
                                    }
                                    .foregroundStyle(.primary)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 20)

                    if let error = viewModel.error {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .padding(.horizontal, 24)
                    }
                }
                .padding(.bottom, 24)
            }
            .onTapGesture { hideKeyboard() }

            // Navigation buttons
            VStack(spacing: 8) {
                HStack(spacing: 12) {
                    Button {
                        viewModel.previousStep()
                    } label: {
                        Text("Back")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color(.systemGray5))
                            .foregroundStyle(.primary)
                            .fontWeight(.medium)
                            .cornerRadius(12)
                    }

                    Button {
                        Task {
                            if await viewModel.saveTransaction() {
                                viewModel.nextStep()
                            }
                        }
                    } label: {
                        if viewModel.isSaving {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.green)
                                .cornerRadius(12)
                        } else {
                            Text("Add Transaction")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.green)
                                .foregroundStyle(.white)
                                .fontWeight(.semibold)
                                .cornerRadius(12)
                        }
                    }
                    .disabled(viewModel.isSaving)
                }

                Button {
                    Task {
                        await viewModel.skipTransaction()
                        viewModel.nextStep()
                    }
                } label: {
                    Text("Skip this step")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.bottom, 4)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Suggested Transactions

    private struct SuggestedTransaction {
        let description: String
        let amount: Decimal
        let itemId: Int
    }

    private var suggestedTransactions: [SuggestedTransaction] {
        let mapping: [(itemName: String, description: String, amount: Decimal)] = [
            ("Groceries", "Weekly groceries", 85.50),
            ("Restaurant", "Lunch out", 15.00),
            ("Gas", "Gas fill-up", 45.00),
            ("Spending Money", "Coffee shop", 6.50),
        ]

        return mapping.compactMap { entry in
            guard let item = viewModel.createdItems.first(where: { $0.name.lowercased() == entry.itemName.lowercased() }) else {
                return nil
            }
            return SuggestedTransaction(description: entry.description, amount: entry.amount, itemId: item.id)
        }
    }
}
