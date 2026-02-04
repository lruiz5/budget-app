import SwiftUI

struct BudgetItemDetail: View {
    let item: BudgetItem
    let onUpdate: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var editedPlanned: String
    @State private var isEditing = false
    @State private var showAddTransaction = false

    init(item: BudgetItem, onUpdate: @escaping () -> Void) {
        self.item = item
        self.onUpdate = onUpdate
        self._editedPlanned = State(initialValue: String(describing: item.planned))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Progress Ring
                    progressSection

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
            .sheet(isPresented: $showAddTransaction) {
                AddTransactionSheet(onSave: onUpdate)
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

    // MARK: - Planned Section

    private var plannedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Planned Amount")
                .font(.headline)

            HStack {
                if isEditing {
                    TextField("Amount", text: $editedPlanned)
                        .keyboardType(.decimalPad)
                        .textFieldStyle(.roundedBorder)

                    Button("Save") {
                        // TODO: Call API to update
                        isEditing = false
                        onUpdate()
                    }
                    .buttonStyle(.borderedProminent)

                    Button("Cancel") {
                        editedPlanned = String(describing: item.planned)
                        isEditing = false
                    }
                    .buttonStyle(.bordered)
                } else {
                    Text(formatCurrency(item.planned))
                        .font(.title3)
                        .fontWeight(.medium)

                    Spacer()

                    Button("Edit") {
                        isEditing = true
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
                    showAddTransaction = true
                } label: {
                    Label("Add", systemImage: "plus")
                        .font(.subheadline)
                }
            }

            if item.transactions.isEmpty {
                Text("No transactions yet")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else {
                ForEach(item.transactions.sorted(by: { $0.date > $1.date })) { transaction in
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
                    }
                    .padding(.vertical, 8)

                    if transaction.id != item.transactions.last?.id {
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
        onUpdate: {}
    )
}
