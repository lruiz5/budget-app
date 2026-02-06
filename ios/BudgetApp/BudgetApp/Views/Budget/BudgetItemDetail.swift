import SwiftUI

struct BudgetItemDetail: View {
    let item: BudgetItem
    let onUpdate: () -> Void
    let onUpdatePlanned: (Int, Decimal) async -> Void
    let onUpdateName: (Int, String) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var editedPlanned: String
    @State private var editedName: String
    @State private var isEditingPlanned = false
    @State private var isEditingName = false
    @State private var isSaving = false
    @State private var activeSheet: ActiveSheet?
    @State private var transactions: [Transaction]

    enum ActiveSheet: Identifiable {
        case addTransaction
        case editTransaction(Transaction)

        var id: String {
            switch self {
            case .addTransaction: return "add"
            case .editTransaction(let t): return "edit-\(t.id)"
            }
        }
    }

    init(item: BudgetItem, onUpdate: @escaping () -> Void, onUpdatePlanned: @escaping (Int, Decimal) async -> Void, onUpdateName: @escaping (Int, String) async -> Void) {
        self.item = item
        self.onUpdate = onUpdate
        self.onUpdatePlanned = onUpdatePlanned
        self.onUpdateName = onUpdateName
        self._editedPlanned = State(initialValue: String(describing: item.planned))
        self._editedName = State(initialValue: item.name)
        self._transactions = State(initialValue: item.transactions)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Progress Ring
                    progressSection

                    // Item Name
                    nameSection

                    // Planned Amount
                    plannedSection

                    // Transactions
                    transactionsSection
                }
                .padding()
            }
            .navigationTitle(item.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .addTransaction:
                    AddTransactionSheet(
                        preSelectedBudgetItemId: item.id,
                        onTransactionCreated: { transaction in
                            transactions.append(transaction)
                        },
                        onSave: onUpdate
                    )
                case .editTransaction(let transaction):
                    EditTransactionSheet(
                        transaction: transaction,
                        onUpdate: onUpdate,
                        onTransactionUpdated: { updated in
                            if let idx = transactions.firstIndex(where: { $0.id == updated.id }) {
                                // If re-categorized away from this item, remove it
                                if updated.budgetItemId != item.id {
                                    transactions.remove(at: idx)
                                } else {
                                    transactions[idx] = updated
                                }
                            }
                        },
                        onTransactionDeleted: { id in
                            transactions.removeAll { $0.id == id }
                        }
                    )
                }
            }
        }
    }

    // MARK: - Progress Section

    private var progressSection: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(Color(.systemGray5), lineWidth: 12)

                Circle()
                    .trim(from: 0, to: min(1.0, item.progress))
                    .stroke(
                        item.isOverBudget ? Color.red : Color.green,
                        style: StrokeStyle(lineWidth: 12, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                VStack {
                    Text(formatCurrency(item.actual))
                        .font(.title2)
                        .fontWeight(.bold)
                    Text("spent")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 120, height: 120)

            HStack(spacing: 24) {
                VStack {
                    Text("Planned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(item.planned))
                        .font(.headline)
                }

                VStack {
                    Text("Remaining")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(item.remaining))
                        .font(.headline)
                        .foregroundStyle(item.isOverBudget ? .red : .green)
                }
            }

            if item.recurringPaymentId != nil {
                Label("Recurring payment", systemImage: "repeat")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Name Section

    private var nameSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Item Name")
                .font(.headline)

            HStack {
                if isEditingName {
                    TextField("Item Name", text: $editedName)
                        .textFieldStyle(.roundedBorder)
                        .autocapitalization(.words)

                    Button("Save") {
                        let trimmed = editedName.trimmingCharacters(in: .whitespaces)
                        guard !trimmed.isEmpty else { return }
                        isSaving = true
                        Task {
                            await onUpdateName(item.id, trimmed)
                            isSaving = false
                            isEditingName = false
                            onUpdate()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSaving || editedName.trimmingCharacters(in: .whitespaces).isEmpty)

                    Button("Cancel") {
                        editedName = item.name
                        isEditingName = false
                    }
                    .buttonStyle(.bordered)
                } else {
                    Text(item.name)
                        .font(.title3)
                        .fontWeight(.medium)

                    Spacer()

                    Button("Edit") {
                        isEditingName = true
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Planned Section

    private var plannedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Planned Amount")
                .font(.headline)

            HStack {
                if isEditingPlanned {
                    TextField("Amount", text: $editedPlanned)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)

                    Button("Save") {
                        guard let newPlanned = Decimal(string: editedPlanned) else { return }
                        isSaving = true
                        Task {
                            await onUpdatePlanned(item.id, newPlanned)
                            isSaving = false
                            isEditingPlanned = false
                            onUpdate()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(isSaving)

                    Button("Cancel") {
                        editedPlanned = String(describing: item.planned)
                        isEditingPlanned = false
                    }
                    .buttonStyle(.bordered)
                } else {
                    Text(formatCurrency(item.planned))
                        .font(.title3)
                        .fontWeight(.medium)

                    Spacer()

                    Button("Edit") {
                        isEditingPlanned = true
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Transactions Section

    private var transactionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Transactions")
                    .font(.headline)

                Spacer()

                Button {
                    activeSheet = .addTransaction
                } label: {
                    Label("Add", systemImage: "plus")
                        .font(.subheadline)
                }
            }

            if transactions.isEmpty {
                Text("No transactions yet")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else {
                let sorted = transactions.sorted(by: { $0.date > $1.date })
                ForEach(sorted) { transaction in
                    Button {
                        activeSheet = .editTransaction(transaction)
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(transaction.merchant ?? transaction.description)
                                    .font(.body)
                                    .lineLimit(1)

                                Text(formatDate(transaction.date))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            Spacer()

                            Text(transaction.displayAmount)
                                .font(.body)
                                .fontWeight(.medium)
                                .foregroundStyle(transaction.type == .income ? .green : .primary)

                            Image(systemName: "chevron.right")
                                .font(.caption)
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 8)

                    if transaction.id != sorted.last?.id {
                        Divider()
                    }
                }
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    // MARK: - Helpers

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter.string(from: date)
    }
}

#Preview {
    BudgetItemDetail(
        item: BudgetItem(
            id: 1,
            categoryId: 1,
            name: "Groceries",
            planned: 400,
            actual: 285.50,
            order: 1,
            recurringPaymentId: nil,
            transactions: []
        ),
        onUpdate: {},
        onUpdatePlanned: { _, _ in },
        onUpdateName: { _, _ in }
    )
}
