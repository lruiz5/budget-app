import SwiftUI

struct CategorySection: View {
    let category: BudgetCategory
    let onItemTap: (BudgetItem) -> Void
    let onAddItem: () -> Void

    @State private var isExpanded = true

    private var progress: Double {
        guard category.planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (category.actual / category.planned) as NSNumber))
    }

    private var isOverBudget: Bool {
        category.actual > category.planned
    }

    var body: some View {
        Section {
            if isExpanded {
                ForEach(category.items.sorted(by: { $0.order < $1.order })) { item in
                    BudgetItemRow(item: item)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            onItemTap(item)
                        }
                }

                Button {
                    onAddItem()
                } label: {
                    Label("Add Item", systemImage: "plus.circle")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        } header: {
            categoryHeader
        }
    }

    // MARK: - Category Header

    private var categoryHeader: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(spacing: 8) {
                Text(category.displayName)
                    .font(.headline)
                    .foregroundStyle(.primary)

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatCurrency(category.actual))
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(isOverBudget ? .red : .primary)

                    Text("of \(formatCurrency(category.planned))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

// MARK: - Budget Item Row

struct BudgetItemRow: View {
    let item: BudgetItem

    private var progress: Double {
        guard item.planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (item.actual / item.planned) as NSNumber))
    }

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 4) {
                    Text(item.name)
                        .font(.body)

                    if item.recurringPaymentId != nil {
                        Text("🔄")
                            .font(.caption)
                    }
                }

                ProgressView(value: progress)
                    .tint(item.isOverBudget ? .red : .green)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(formatCurrency(item.actual))
                    .font(.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(item.isOverBudget ? .red : .primary)

                Text(formatCurrency(item.remaining))
                    .font(.caption)
                    .foregroundStyle(item.isOverBudget ? .red : .secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

#Preview {
    List {
        CategorySection(
            category: BudgetCategory(
                id: 1,
                budgetId: 1,
                categoryType: "food",
                name: "Food",
                order: 1,
                emoji: nil,
                items: [],
                planned: 500,
                actual: 320
            ),
            onItemTap: { _ in },
            onAddItem: { }
        )
    }
}
