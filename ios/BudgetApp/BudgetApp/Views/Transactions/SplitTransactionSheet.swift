import SwiftUI

// MARK: - Split Row Model

struct SplitRow: Identifiable {
    let id = UUID()
    var budgetItemId: Int?
    var budgetItemName: String?
    var amount: String
    var description: String
    var isNonEarned: Bool = false

    var amountDecimal: Decimal? {
        Decimal(string: amount)
    }
}

// MARK: - Split Transaction Sheet

struct SplitTransactionSheet: View {
    let transaction: Transaction
    let existingSplits: [SplitTransaction]
    let onComplete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @StateObject private var budgetVM = BudgetViewModel()
    @State private var splitRows: [SplitRow]
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var isEditMode: Bool { !existingSplits.isEmpty }

    init(transaction: Transaction, existingSplits: [SplitTransaction] = [], onComplete: @escaping () -> Void) {
        self.transaction = transaction
        self.existingSplits = existingSplits
        self.onComplete = onComplete

        if existingSplits.isEmpty {
            self._splitRows = State(initialValue: [
                SplitRow(amount: "", description: ""),
                SplitRow(amount: "", description: "")
            ])
        } else {
            self._splitRows = State(initialValue: existingSplits.map { split in
                SplitRow(
                    budgetItemId: split.budgetItemId,
                    amount: "\(split.amount)",
                    description: split.description ?? "",
                    isNonEarned: split.isNonEarned
                )
            })
        }
    }

    // MARK: - Validation

    private var totalSplitAmount: Decimal {
        splitRows.compactMap(\.amountDecimal).reduce(0, +)
    }

    private var remaining: Decimal {
        transaction.amount - totalSplitAmount
    }

    private var isBalanced: Bool {
        abs(remaining) < Decimal(string: "0.01")!
    }

    private var validSplitCount: Int {
        splitRows.filter { $0.budgetItemId != nil && ($0.amountDecimal ?? 0) > 0 }.count
    }

    private var canSave: Bool {
        isBalanced && validSplitCount >= 2 && !isSaving
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Parent transaction header
                    headerSection

                    // Split rows
                    ForEach(splitRows.indices, id: \.self) { index in
                        splitRowView(index: index)
                    }

                    // Add split button
                    Button {
                        splitRows.append(SplitRow(amount: "", description: ""))
                    } label: {
                        HStack {
                            Image(systemName: "plus.circle")
                            Text("Add Split")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.blue)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [6]))
                                .foregroundStyle(.blue.opacity(0.3))
                        )
                    }

                    // Remaining amount indicator
                    remainingIndicator

                    // Error message
                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding()
            }
            .navigationTitle(isEditMode ? "Edit Split" : "Split Transaction")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditMode ? "Update" : "Split") {
                        saveSplits()
                    }
                    .disabled(!canSave)
                }
            }
            .task {
                await budgetVM.loadBudget()
                // Resolve budget item names for existing splits
                if isEditMode, let budget = budgetVM.budget {
                    for i in splitRows.indices {
                        if let itemId = splitRows[i].budgetItemId {
                            splitRows[i].budgetItemName = findItemName(itemId: itemId, in: budget)
                        }
                    }
                }
            }
        }
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Text(transaction.merchant ?? transaction.description)
                .font(.headline)
                .lineLimit(1)

            Text(formatCurrency(transaction.amount))
                .font(.title)
                .fontWeight(.bold)

            HStack(spacing: 8) {
                Text(transaction.type == .income ? "Income" : "Expense")
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(transaction.type == .income ? Color.green.opacity(0.15) : Color.red.opacity(0.15))
                    .foregroundStyle(transaction.type == .income ? .green : .red)
                    .cornerRadius(6)

                Text(formatDate(transaction.date))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Split Row

    private func splitRowView(index: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Split \(index + 1)")
                    .font(.subheadline)
                    .fontWeight(.medium)

                Spacer()

                if splitRows.count > 2 {
                    Button {
                        splitRows.remove(at: index)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // Budget item picker
            if let budget = budgetVM.budget {
                NavigationLink {
                    BudgetItemPickerView(
                        selectedItemId: Binding(
                            get: { splitRows[index].budgetItemId },
                            set: { newId in
                                splitRows[index].budgetItemId = newId
                                if let id = newId {
                                    splitRows[index].budgetItemName = findItemName(itemId: id, in: budget)
                                }
                            }
                        ),
                        budget: budget
                    )
                } label: {
                    HStack {
                        Text(splitRows[index].budgetItemName ?? "Select budget item")
                            .foregroundStyle(splitRows[index].budgetItemId != nil ? .primary : .secondary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .background(Color(.systemGray5))
                    .cornerRadius(8)
                }
            } else if budgetVM.isLoading {
                HStack {
                    ProgressView()
                        .scaleEffect(0.8)
                    Text("Loading categories...")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }

            // Amount + Remainder
            HStack(spacing: 8) {
                HStack {
                    Text("$")
                        .foregroundStyle(.secondary)
                    TextField("0.00", text: $splitRows[index].amount)
                        .keyboardType(.decimalPad)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color(.systemGray5))
                .cornerRadius(8)

                Button("Remainder") {
                    applyRemainder(to: index)
                }
                .font(.caption)
                .buttonStyle(.bordered)
                .disabled(remaining == 0)
            }

            // Description
            TextField("Description (optional)", text: $splitRows[index].description)
                .font(.subheadline)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Color(.systemGray5))
                .cornerRadius(8)

            // Non-earned toggle (income transactions only)
            if transaction.type == .income {
                Toggle(isOn: $splitRows[index].isNonEarned) {
                    Label("Non-earned", systemImage: "gift")
                        .font(.subheadline)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Remaining Indicator

    private var remainingIndicator: some View {
        HStack {
            if isBalanced {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
                Text("Balanced!")
                    .fontWeight(.medium)
                    .foregroundStyle(.green)
            } else if remaining > 0 {
                Image(systemName: "exclamationmark.circle.fill")
                    .foregroundStyle(.orange)
                Text("Remaining: \(formatCurrency(remaining))")
                    .fontWeight(.medium)
                    .foregroundStyle(.orange)
            } else {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                Text("Over by: \(formatCurrency(abs(remaining)))")
                    .fontWeight(.medium)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(
            isBalanced
                ? Color.green.opacity(0.1)
                : remaining > 0
                    ? Color.orange.opacity(0.1)
                    : Color.red.opacity(0.1)
        )
        .cornerRadius(12)
    }

    // MARK: - Actions

    private func applyRemainder(to index: Int) {
        let currentAmount = splitRows[index].amountDecimal ?? 0
        let newAmount = currentAmount + remaining
        if newAmount > 0 {
            splitRows[index].amount = "\(newAmount)"
        }
    }

    private func saveSplits() {
        let inputs = splitRows.compactMap { row -> SplitInput? in
            guard let itemId = row.budgetItemId,
                  let amount = row.amountDecimal,
                  amount > 0 else { return nil }
            return SplitInput(
                budgetItemId: itemId,
                amount: amount,
                description: row.description.isEmpty ? nil : row.description,
                isNonEarned: row.isNonEarned ? true : nil
            )
        }

        guard inputs.count >= 2 else { return }

        isSaving = true
        errorMessage = nil
        Task {
            do {
                let request = CreateSplitsRequest(
                    parentTransactionId: transaction.id,
                    splits: inputs
                )
                _ = try await TransactionService.shared.createSplits(request)
                await MainActor.run {
                    onComplete()
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isSaving = false
                }
            }
        }
    }

    // MARK: - Helpers

    private func findItemName(itemId: Int, in budget: Budget) -> String? {
        for category in budget.categories.values {
            if let item = category.items.first(where: { $0.id == itemId }) {
                return "\(category.categoryEmoji) \(item.name)"
            }
        }
        return nil
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }
}

// MARK: - Budget Item Picker View

struct BudgetItemPickerView: View {
    @Binding var selectedItemId: Int?
    let budget: Budget
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            ForEach(budget.sortedCategoryKeys, id: \.self) { key in
                if let category = budget.categories[key] {
                    Section(category.displayName) {
                        ForEach(category.items) { item in
                            Button {
                                selectedItemId = item.id
                                dismiss()
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
                                    if selectedItemId == item.id {
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
        .listStyle(.insetGrouped)
        .navigationTitle("Select Item")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

#Preview {
    SplitTransactionSheet(
        transaction: Transaction(
            id: 1,
            description: "Walmart",
            amount: 150.00,
            type: .expense,
            merchant: "Walmart"
        ),
        onComplete: {}
    )
}
