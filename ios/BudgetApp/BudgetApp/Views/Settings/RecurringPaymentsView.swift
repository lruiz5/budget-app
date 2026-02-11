import SwiftUI

// MARK: - Active Sheet Enum (single-sheet pattern)

enum RecurringActiveSheet: Identifiable {
    case addPayment
    case editPayment(RecurringPayment)

    var id: String {
        switch self {
        case .addPayment: return "add"
        case .editPayment(let p): return "edit-\(p.id)"
        }
    }
}

// MARK: - Main View

struct RecurringPaymentsView: View {
    @StateObject private var viewModel = RecurringViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var activeSheet: RecurringActiveSheet?

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading...")
                } else if viewModel.payments.isEmpty {
                    emptyStateView
                } else {
                    paymentsList
                }
            }
            .navigationTitle("Recurring Payments")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        activeSheet = .addPayment
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .refreshable {
                await viewModel.loadPayments()
            }
            .task {
                await viewModel.loadPayments()
            }
            .sheet(item: $activeSheet) { sheet in
                switch sheet {
                case .addPayment:
                    AddRecurringPaymentSheet(onSave: { name, amount, frequency, dueDate, categoryType in
                        await viewModel.createPayment(
                            name: name,
                            amount: amount,
                            frequency: frequency,
                            nextDueDate: dueDate,
                            categoryType: categoryType
                        )
                    })
                case .editPayment(let payment):
                    EditRecurringPaymentSheet(payment: payment, viewModel: viewModel)
                }
            }
            .toast(
                isPresented: $viewModel.showToast,
                message: viewModel.toastMessage ?? "",
                isError: viewModel.isToastError
            )
        }
    }

    // MARK: - Payments List

    private var paymentsList: some View {
        List {
            if !viewModel.upcomingPayments.isEmpty {
                Section("Upcoming (30 days)") {
                    ForEach(viewModel.upcomingPayments) { payment in
                        RecurringPaymentRow(payment: payment)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                activeSheet = .editPayment(payment)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                Button(role: .destructive) {
                                    Task {
                                        await viewModel.deletePayment(id: payment.id)
                                    }
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                    }
                }
            }

            Section(viewModel.upcomingPayments.isEmpty ? "All Payments" : "Other Payments") {
                ForEach(viewModel.payments.filter { p in !viewModel.upcomingPayments.contains(where: { $0.id == p.id }) }) { payment in
                    RecurringPaymentRow(payment: payment)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            activeSheet = .editPayment(payment)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            Button(role: .destructive) {
                                Task {
                                    await viewModel.deletePayment(id: payment.id)
                                }
                            } label: {
                                Label("Delete", systemImage: "trash")
                            }
                        }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        ContentUnavailableView {
            Label("No Recurring Payments", systemImage: "repeat")
        } description: {
            Text("Add recurring bills and subscriptions to track your upcoming expenses")
        } actions: {
            Button("Add Payment") {
                activeSheet = .addPayment
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

// MARK: - Recurring Payment Row

struct RecurringPaymentRow: View {
    let payment: RecurringPayment

    private var dueDateColor: Color {
        if payment.daysUntilDue <= 7 { return .red }
        if payment.daysUntilDue <= 30 { return .orange }
        return .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                // Category emoji + name
                HStack(spacing: 6) {
                    if let category = payment.categoryType,
                       let emoji = Constants.categoryEmojis[category] {
                        Text(emoji)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text(payment.name)
                            .font(.body)
                            .fontWeight(.medium)

                        HStack(spacing: 4) {
                            Text(payment.frequency.displayName)
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            if payment.frequency != .monthly {
                                Text("(\(formatCurrency(payment.monthlyContribution))/mo)")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(formatCurrency(payment.amount))
                            .font(.body)
                            .fontWeight(.medium)

                        if payment.progress >= 1.0 {
                            Text("Paid")
                                .font(.caption2)
                                .fontWeight(.semibold)
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.green, in: Capsule())
                        }
                    }

                    Text("Due \(formatDate(payment.nextDueDate))")
                        .font(.caption)
                        .foregroundStyle(dueDateColor)
                }
            }

            if payment.progress < 1.0 {
                ProgressView(value: payment.progress)
                    .tint(.blue)

                HStack {
                    Text("\(formatCurrency(payment.fundedAmount)) saved")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Text("\(formatCurrency(payment.remaining)) to go")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
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

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - Add Recurring Payment Sheet

struct AddRecurringPaymentSheet: View {
    let onSave: (String, Decimal, PaymentFrequency, Date, String?) async -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var amount = ""
    @State private var frequency: PaymentFrequency = .monthly
    @State private var nextDueDate = Date()
    @State private var categoryType = ""
    @State private var isSaving = false

    private var categories: [String] {
        Constants.defaultCategories.filter { $0 != "income" }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)

                    TextField("Amount", text: $amount)
                        .keyboardType(.decimalPad)

                    Picker("Frequency", selection: $frequency) {
                        ForEach(PaymentFrequency.allCases, id: \.self) { freq in
                            Text(freq.displayName).tag(freq)
                        }
                    }

                    DatePicker("Next Due Date", selection: $nextDueDate, displayedComponents: .date)
                }

                if frequency != .monthly, let amountDecimal = Decimal(string: amount), amountDecimal > 0 {
                    Section {
                        LabeledContent("Monthly Contribution", value: formatCurrency(amountDecimal / Decimal(frequency.monthsInCycle)))
                    }
                }

                Section("Category (Optional)") {
                    Picker("Category", selection: $categoryType) {
                        Text("None").tag("")
                        ForEach(categories, id: \.self) { cat in
                            HStack {
                                Text(Constants.categoryEmojis[cat] ?? "")
                                Text(cat.capitalized)
                            }
                            .tag(cat)
                        }
                    }
                }
            }
            .navigationTitle("Add Payment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        guard let amountDecimal = Decimal(string: amount) else { return }
                        isSaving = true
                        Task {
                            await onSave(
                                name,
                                amountDecimal,
                                frequency,
                                nextDueDate,
                                categoryType.isEmpty ? nil : categoryType
                            )
                            isSaving = false
                            dismiss()
                        }
                    }
                    .disabled(name.isEmpty || amount.isEmpty || isSaving)
                }
            }
        }
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

// MARK: - Edit Recurring Payment Sheet

struct EditRecurringPaymentSheet: View {
    let payment: RecurringPayment
    @ObservedObject var viewModel: RecurringViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var amount: String
    @State private var frequency: PaymentFrequency
    @State private var nextDueDate: Date
    @State private var categoryType: String
    @State private var isSaving = false
    @State private var showDeleteConfirmation = false

    private var categories: [String] {
        Constants.defaultCategories.filter { $0 != "income" }
    }

    private var hasChanges: Bool {
        name != payment.name ||
        Decimal(string: amount) != payment.amount ||
        frequency != payment.frequency ||
        !Calendar.current.isDate(nextDueDate, inSameDayAs: payment.nextDueDate) ||
        categoryType != (payment.categoryType ?? "")
    }

    init(payment: RecurringPayment, viewModel: RecurringViewModel) {
        self.payment = payment
        self.viewModel = viewModel
        _name = State(initialValue: payment.name)
        _amount = State(initialValue: "\(payment.amount)")
        _frequency = State(initialValue: payment.frequency)
        _nextDueDate = State(initialValue: payment.nextDueDate)
        _categoryType = State(initialValue: payment.categoryType ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)

                    TextField("Amount", text: $amount)
                        .keyboardType(.decimalPad)

                    Picker("Frequency", selection: $frequency) {
                        ForEach(PaymentFrequency.allCases, id: \.self) { freq in
                            Text(freq.displayName).tag(freq)
                        }
                    }

                    DatePicker("Next Due Date", selection: $nextDueDate, displayedComponents: .date)
                }

                Section("Category") {
                    Picker("Category", selection: $categoryType) {
                        Text("None").tag("")
                        ForEach(categories, id: \.self) { cat in
                            HStack {
                                Text(Constants.categoryEmojis[cat] ?? "")
                                Text(cat.capitalized)
                            }
                            .tag(cat)
                        }
                    }
                }

                // Funding Progress
                Section("Funding Progress") {
                    VStack(alignment: .leading, spacing: 8) {
                        ProgressView(value: payment.progress)
                            .tint(payment.progress >= 1.0 ? .green : .blue)

                        HStack {
                            Text("\(formatCurrency(payment.fundedAmount)) of \(formatCurrency(payment.amount))")
                                .font(.caption)
                                .foregroundStyle(.secondary)

                            Spacer()

                            Text("\(Int(payment.progress * 100))%")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if frequency != .monthly, let amountDecimal = Decimal(string: amount), amountDecimal > 0 {
                        LabeledContent("Monthly Contribution", value: formatCurrency(amountDecimal / Decimal(frequency.monthsInCycle)))
                    }
                }

                // Actions
                Section {
                    Button {
                        Task {
                            await viewModel.resetFunding(paymentId: payment.id)
                            dismiss()
                        }
                    } label: {
                        Label("Mark as Paid & Reset", systemImage: "checkmark.circle")
                    }

                    Button(role: .destructive) {
                        showDeleteConfirmation = true
                    } label: {
                        Label("Delete Payment", systemImage: "trash")
                    }
                }
            }
            .navigationTitle(payment.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                    }
                    .disabled(!hasChanges || name.isEmpty || amount.isEmpty || isSaving)
                }
            }
            .confirmationDialog("Delete Payment", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task {
                        await viewModel.deletePayment(id: payment.id)
                        dismiss()
                    }
                }
            } message: {
                Text("Are you sure you want to delete \"\(payment.name)\"? This cannot be undone.")
            }
        }
    }

    private func save() {
        guard let amountDecimal = Decimal(string: amount) else { return }
        let currentCategory = payment.categoryType ?? ""
        isSaving = true
        Task {
            await viewModel.updatePayment(
                id: payment.id,
                name: name != payment.name ? name : nil,
                amount: amountDecimal != payment.amount ? amountDecimal : nil,
                frequency: frequency != payment.frequency ? frequency : nil,
                nextDueDate: !Calendar.current.isDate(nextDueDate, inSameDayAs: payment.nextDueDate) ? nextDueDate : nil,
                categoryType: categoryType != currentCategory ? (categoryType.isEmpty ? nil : categoryType) : nil
            )
            isSaving = false
            dismiss()
        }
    }

    private func formatCurrency(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = "USD"
        return formatter.string(from: value as NSNumber) ?? "$0.00"
    }
}

#Preview {
    RecurringPaymentsView()
}
