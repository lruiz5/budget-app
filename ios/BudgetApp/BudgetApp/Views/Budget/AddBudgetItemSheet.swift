import SwiftUI

struct AddBudgetItemSheet: View {
    let categoryId: Int
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var planned = ""
    @State private var isSaving = false

    private let budgetService = BudgetService.shared

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Item Name", text: $name)
                        .autocapitalization(.words)

                    HStack {
                        Text("$")
                        TextField("Planned Amount", text: $planned)
                            .keyboardType(.decimalPad)
                    }
                }

                Section {
                    Text("This item will be added to the selected category.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Add Budget Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveItem()
                    }
                    .disabled(name.isEmpty || planned.isEmpty || isSaving)
                }
            }
            .interactiveDismissDisabled(isSaving)
        }
    }

    private func saveItem() {
        guard let plannedDecimal = Decimal(string: planned) else { return }

        isSaving = true

        Task {
            do {
                _ = try await budgetService.createBudgetItem(
                    categoryId: categoryId,
                    name: name,
                    planned: plannedDecimal
                )
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
    AddBudgetItemSheet(categoryId: 1, onSave: {})
}
