import SwiftUI

struct RecurringPaymentsView: View {
    @StateObject private var viewModel = RecurringViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var showAddPayment = false
    @State private var selectedPayment: RecurringPayment?

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
                        showAddPayment = true
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
            .sheet(isPresented: $showAddPayment) {
                AddRecurringPaymentSheet(onSave: {
                    Task { await viewModel.loadPayments() }
                })
            }
            .sheet(item: $selectedPayment) { payment in
                RecurringPaymentDetailSheet(payment: payment, onUpdate: {
                    Task { await viewModel.loadPayments() }
                })
            }
        }
    }

    // MARK: - Payments List

    private var paymentsList: some View {
        List {
            // Upcoming Section
            if !viewModel.upcomingPayments.isEmpty {
                Section("Upcoming (60 days)") {
                    ForEach(viewModel.upcomingPayments) { payment in
                        RecurringPaymentRow(payment: payment)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                selectedPayment = payment
                            }
                    }
                }
            }

            // All Payments Section
            Section("All Payments") {
                ForEach(viewModel.payments) { payment in
                    RecurringPaymentRow(payment: payment)
                        .contentShape(Rectangle())
                        .onTapGesture {
                            selectedPayment = payment
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
                showAddPayment = true
            }
            .buttonStyle(.borderedProminent)
        }
    }
}

// MARK: - Recurring Payment Row

struct RecurringPaymentRow: View {
    let payment: RecurringPayment

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(payment.name)
                        .font(.body)
                        .fontWeight(.medium)

                    Text(payment.frequency.displayName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatCurrency(payment.amount))
                        .font(.body)
                        .fontWeight(.medium)

                    Text("Due \(formatDate(payment.nextDueDate))")
                        .font(.caption)
                        .foregroundStyle(payment.isUpcoming ? .orange : .secondary)
                }
            }

            // Progress Bar
            ProgressView(value: payment.progress)
                .tint(payment.progress >= 1.0 ? .green : .blue)

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
    let onSave: () -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var amount = ""
    @State private var frequency: PaymentFrequency = .monthly
    @State private var nextDueDate = Date()
    @State private var categoryType = ""

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

                Section("Category (Optional)") {
                    TextField("Category Type", text: $categoryType)
                        .autocapitalization(.none)
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
                        // TODO: Call API to create
                        onSave()
                        dismiss()
                    }
                    .disabled(name.isEmpty || amount.isEmpty)
                }
            }
        }
    }
}

// MARK: - Recurring Payment Detail Sheet

struct RecurringPaymentDetailSheet: View {
    let payment: RecurringPayment
    let onUpdate: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    LabeledContent("Amount", value: formatCurrency(payment.amount))
                    LabeledContent("Frequency", value: payment.frequency.displayName)
                    LabeledContent("Next Due", value: formatDate(payment.nextDueDate))
                    LabeledContent("Days Until Due", value: "\(payment.daysUntilDue)")
                }

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

                    LabeledContent("Monthly Contribution", value: formatCurrency(payment.monthlyContribution))
                }
            }
            .navigationTitle(payment.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
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

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }
}

#Preview {
    RecurringPaymentsView()
}
