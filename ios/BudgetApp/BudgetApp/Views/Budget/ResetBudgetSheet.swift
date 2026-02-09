import SwiftUI

struct ResetBudgetSheet: View {
    let budget: Budget
    let onReset: (ResetMode) async -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedMode: ResetMode?
    @State private var isResetting = false

    var body: some View {
        NavigationStack {
            Group {
                if let mode = selectedMode {
                    confirmationView(mode: mode)
                } else {
                    modeSelectionView
                }
            }
            .navigationTitle("Reset Budget")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isResetting)
                }
            }
            .interactiveDismissDisabled(isResetting)
        }
    }

    // MARK: - Step 1: Mode Selection

    private var modeSelectionView: some View {
        List {
            Section {
                Text("How would you like to reset your budget?")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                Button {
                    withAnimation { selectedMode = .zero }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Zero out all planned amounts")
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundStyle(.primary)
                        Text("Keep your categories and items, but set all planned amounts to $0.00")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }

                Button {
                    withAnimation { selectedMode = .replace }
                } label: {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Replace with last month's budget")
                            .font(.body)
                            .fontWeight(.medium)
                            .foregroundStyle(.primary)
                        Text("Delete current items and copy everything from \(previousMonthName)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Step 2: Confirmation

    private func confirmationView(mode: ResetMode) -> some View {
        List {
            Section {
                Text(confirmationText(for: mode))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Section {
                HStack {
                    Button("Back") {
                        withAnimation { selectedMode = nil }
                    }
                    .disabled(isResetting)

                    Spacer()

                    Button("Confirm Reset") {
                        performReset(mode: mode)
                    }
                    .fontWeight(.medium)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(Color.red)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .disabled(isResetting)
                }
            }

            if isResetting {
                Section {
                    HStack {
                        Spacer()
                        ProgressView("Resetting...")
                        Spacer()
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Helpers

    private var previousMonthName: String {
        // budget.month is 0-indexed (JS convention)
        let prevMonth = budget.month == 0 ? 11 : budget.month - 1
        let monthNames = ["January", "February", "March", "April", "May", "June",
                          "July", "August", "September", "October", "November", "December"]
        return monthNames[prevMonth]
    }

    private func confirmationText(for mode: ResetMode) -> String {
        switch mode {
        case .zero:
            return "This will set all planned amounts to $0.00. Your categories, items, and transactions will be kept."
        case .replace:
            return "This will delete all current items and replace them with \(previousMonthName)'s budget. Transactions will be kept."
        }
    }

    private func performReset(mode: ResetMode) {
        isResetting = true
        Task {
            await onReset(mode)
            await MainActor.run {
                dismiss()
            }
        }
    }
}

#Preview {
    ResetBudgetSheet(
        budget: Budget(
            id: 1, userId: "test", month: 1, year: 2026,
            buffer: 0, createdAt: Date(), categories: [:]
        ),
        onReset: { _ in }
    )
}
