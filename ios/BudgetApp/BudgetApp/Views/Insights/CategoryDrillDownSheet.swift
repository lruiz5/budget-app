import SwiftUI

struct CategoryDrillDownSheet: View {
    let category: BudgetCategory
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Header card
                    headerCard

                    // Items list
                    if category.items.isEmpty {
                        Text("No items in this category")
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 40)
                    } else {
                        VStack(spacing: 0) {
                            ForEach(sortedItems) { item in
                                itemRow(item)

                                if item.id != sortedItems.last?.id {
                                    // Progress bar divider
                                    GeometryReader { geo in
                                        Capsule()
                                            .fill(item.isOverBudget ? Color.red : Color.green)
                                            .frame(width: geo.size.width * min(1.0, item.progress), height: 2)
                                    }
                                    .frame(height: 2)
                                    .padding(.vertical, 4)
                                }
                            }
                        }
                        .padding()
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                    }
                }
                .padding()
            }
            .navigationTitle(category.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var sortedItems: [BudgetItem] {
        category.items.sorted { $0.actual > $1.actual }
    }

    private var headerCard: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Planned")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(category.planned))
                        .font(.title3)
                        .fontWeight(.semibold)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 4) {
                    Text("Actual")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(category.actual))
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundStyle(category.actual > category.planned ? .red : .primary)
                }
            }

            let diff = category.planned - category.actual
            HStack {
                Spacer()
                Text(diff >= 0 ? "\(formatCurrency(diff)) under budget" : "\(formatCurrency(abs(diff))) over budget")
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(diff >= 0 ? .green : .red)
                Spacer()
            }
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)
    }

    private func itemRow(_ item: BudgetItem) -> some View {
        HStack {
            Text(item.name)
                .font(.subheadline)
                .lineLimit(1)

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: 12) {
                    Text(formatCurrency(item.planned))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(formatCurrency(item.actual))
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(item.isOverBudget ? .red : .primary)
                }

                let diff = item.planned - item.actual
                Text(diff >= 0 ? "\(formatCurrency(diff)) left" : "\(formatCurrency(abs(diff))) over")
                    .font(.caption2)
                    .foregroundStyle(diff >= 0 ? .green : .red)
            }
        }
        .padding(.vertical, 6)
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        formatter.maximumFractionDigits = 0
        return formatter.string(from: value as NSNumber) ?? "$0"
    }

    private func abs(_ value: Decimal) -> Decimal {
        value < 0 ? -value : value
    }
}
