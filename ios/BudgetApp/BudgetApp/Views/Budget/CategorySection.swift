import SwiftUI
import UniformTypeIdentifiers

struct CategorySection: View {
    let category: BudgetCategory
    let onItemTap: (BudgetItem) -> Void
    let onAddItem: () -> Void
    let onDeleteItem: ((Int) -> Void)?
    let onReorderItems: (([Int]) -> Void)?
    var onUpdatePlanned: ((Int, Decimal) -> Void)?
    var onUpdateName: ((Int, String) -> Void)?
    let onDeleteCategory: (() -> Void)?
    var onAssignTransaction: ((Int, Int) -> Void)?

    @State private var isExpanded = true
    @State private var orderedItems: [BudgetItem] = []
    @State private var activeSwipeItemId: Int?
    @State private var draggingItem: BudgetItem?
    @State private var highlightedDropTargetId: Int?

    private var progress: Double {
        guard category.planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (category.actual / category.planned) as NSNumber))
    }

    private var isOverBudget: Bool {
        category.actual > category.planned
    }

    var body: some View {
        VStack(spacing: 0) {
            categoryHeader
                .padding(.horizontal, 16)

            if isExpanded {
                ForEach(orderedItems) { item in
                    if let onDeleteItem {
                        SwipeToDeleteRow(
                            itemId: item.id,
                            activeSwipeItemId: $activeSwipeItemId,
                            onDelete: { onDeleteItem(item.id) }
                        ) {
                            BudgetItemRow(item: item, onQuickEditPlanned: onUpdatePlanned, onQuickEditName: onUpdateName)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 8)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    onItemTap(item)
                                }
                        }
                        .overlay(
                            RoundedRectangle(cornerRadius: 4)
                                .stroke(Color.green, lineWidth: 2)
                                .opacity(highlightedDropTargetId == item.id ? 1 : 0)
                                .animation(.easeInOut(duration: 0.15), value: highlightedDropTargetId)
                        )
                        .onDrag {
                            draggingItem = item
                            return NSItemProvider(object: String(item.id) as NSString)
                        }
                        .onDrop(of: [.text], delegate: BudgetItemDropDelegate(
                            item: item,
                            items: $orderedItems,
                            draggingItem: $draggingItem,
                            highlightedDropTargetId: $highlightedDropTargetId,
                            onReorder: { ids in onReorderItems?(ids) },
                            onAssignTransaction: onAssignTransaction
                        ))
                    } else {
                        BudgetItemRow(item: item, onQuickEditPlanned: onUpdatePlanned, onQuickEditName: onUpdateName)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                onItemTap(item)
                            }
                    }
                }

                Button {
                    onAddItem()
                } label: {
                    Label("Add Item", systemImage: "plus.circle")
                        .font(.outfitSubheadline)
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .onAppear {
            orderedItems = category.items.sorted { $0.order < $1.order }
        }
        .onChange(of: category.items) { _, _ in
            orderedItems = category.items.sorted { $0.order < $1.order }
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
                    .font(.outfitHeadline)
                    .foregroundStyle(.primary)

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatCurrency(category.actual))
                        .font(.outfitSubheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(isOverBudget ? .red : .primary)

                    Text("of \(formatCurrency(category.planned))")
                        .font(.outfitCaption)
                        .foregroundStyle(.secondary)
                }

                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.outfitCaption)
                    .foregroundStyle(.secondary)
            }
            .padding(.vertical, 8)
        }
        .buttonStyle(.plain)
        .contextMenu {
            if let onDeleteCategory {
                Button(role: .destructive) {
                    onDeleteCategory()
                } label: {
                    Label("Delete Category", systemImage: "trash")
                }
            }
        }
    }

    private func formatCurrency(_ value: Decimal) -> String {
        Formatters.currency.string(from: value as NSNumber) ?? "$0.00"
    }
}

// MARK: - Budget Item Row

struct BudgetItemRow: View {
    let item: BudgetItem
    var onQuickEditPlanned: ((Int, Decimal) -> Void)?
    var onQuickEditName: ((Int, String) -> Void)?

    @State private var isEditingPlanned = false
    @State private var editedPlannedText = ""
    @FocusState private var isFieldFocused: Bool

    @State private var isEditingName = false
    @State private var editedNameText = ""
    @FocusState private var isNameFocused: Bool

    private var progress: Double {
        guard item.planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (item.actual / item.planned) as NSNumber))
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                if isEditingName {
                    TextField("Item name", text: $editedNameText)
                        .font(.outfitBody)
                        .textFieldStyle(.roundedBorder)
                        .focused($isNameFocused)
                        .onSubmit { commitNameEdit() }
                } else {
                    Button {
                        if onQuickEditName != nil {
                            editedNameText = item.name
                            isEditingName = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                isNameFocused = true
                            }
                        }
                    } label: {
                        HStack(spacing: 4) {
                            Text(item.name)
                                .font(.outfitBody)
                                .foregroundStyle(.primary)

                            if item.recurringPaymentId != nil {
                                Text("🔄")
                                    .font(.outfitCaption)
                            }

                            if let day = item.expectedDay {
                                Text("\(day)\(day >= 11 && day <= 13 ? "th" : [1: "st", 2: "nd", 3: "rd"][day % 10] ?? "th")")
                                    .font(.outfitCaption2)
                                    .foregroundStyle(.blue)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 1)
                                    .background(Color.blue.opacity(0.1))
                                    .clipShape(Capsule())
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                Spacer()

                if isEditingPlanned {
                    // Inline planned amount editing
                    HStack(spacing: 4) {
                        Text("$")
                            .font(.outfitCaption)
                            .foregroundStyle(.secondary)
                        TextField("0.00", text: $editedPlannedText)
                            .keyboardType(.decimalPad)
                            .font(.outfitSubheadline)
                            .fontWeight(.medium)
                            .frame(width: 80)
                            .textFieldStyle(.roundedBorder)
                            .focused($isFieldFocused)
                            .onSubmit { commitPlannedEdit() }
                        Button {
                            commitPlannedEdit()
                        } label: {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                        }
                        .buttonStyle(.plain)
                    }
                } else {
                    // Amount display — wrapped in Button to capture tap before row's onTapGesture
                    Button {
                        if onQuickEditPlanned != nil {
                            editedPlannedText = "\(item.planned)"
                            isEditingPlanned = true
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                                isFieldFocused = true
                            }
                        }
                    } label: {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(formatCurrency(item.actual))
                                .font(.outfitSubheadline)
                                .fontWeight(.medium)
                                .foregroundStyle(item.isOverBudget ? .red : .primary)

                            Text(formatCurrency(item.remaining))
                                .font(.outfitCaption)
                                .foregroundStyle(item.isOverBudget ? .red : .secondary)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }

            // Full-width progress bar — scaleEffect avoids GeometryReader layout overhead
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color(.systemGray5))
                Capsule()
                    .fill(item.isOverBudget ? Color.red : Color.green)
                    .scaleEffect(x: CGFloat(progress), anchor: .leading)
            }
            .frame(height: 2)
        }
        .padding(.vertical, 2)
        .onChange(of: isFieldFocused) { _, focused in
            if !focused && isEditingPlanned {
                commitPlannedEdit()
            }
        }
        .onChange(of: isNameFocused) { _, focused in
            if !focused && isEditingName {
                commitNameEdit()
            }
        }
    }

    private func commitNameEdit() {
        let trimmed = editedNameText.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else {
            isEditingName = false
            return
        }
        onQuickEditName?(item.id, trimmed)
        isEditingName = false
    }

    private func commitPlannedEdit() {
        guard let newValue = editedPlannedText.toDecimal(), newValue >= 0 else {
            isEditingPlanned = false
            return
        }
        onQuickEditPlanned?(item.id, newValue)
        isEditingPlanned = false
    }

    private func formatCurrency(_ value: Decimal) -> String {
        Formatters.currency.string(from: value as NSNumber) ?? "$0.00"
    }
}

#Preview {
    ScrollView {
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
            onAddItem: { },
            onDeleteItem: nil,
            onReorderItems: nil,
            onUpdatePlanned: nil,
            onUpdateName: nil,
            onDeleteCategory: nil,
            onAssignTransaction: nil
        )
    }
}
