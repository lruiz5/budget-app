import Foundation
import Combine

@MainActor
class RecurringViewModel: ObservableObject {
    @Published var payments: [RecurringPayment] = []
    @Published var isLoading = false
    @Published var error: String?

    // Toast state for non-blocking feedback
    @Published var showToast = false
    @Published var toastMessage: String?
    @Published var isToastError = false

    private let recurringService = RecurringService.shared

    var upcomingPayments: [RecurringPayment] {
        payments.filter { $0.isUpcoming && $0.isActive }
            .sorted { $0.nextDueDate < $1.nextDueDate }
    }

    // MARK: - Toast Helper

    private func showToast(_ message: String, isError: Bool) {
        toastMessage = message
        isToastError = isError
        showToast = true
    }

    // MARK: - Load Payments

    func loadPayments() async {
        isLoading = true
        error = nil

        do {
            payments = try await recurringService.getRecurringPayments()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }

        isLoading = false
    }

    // MARK: - Create Payment

    func createPayment(name: String, amount: Decimal, frequency: PaymentFrequency, nextDueDate: Date, categoryType: String?) async {
        do {
            let request = CreateRecurringRequest(
                name: name,
                amount: amount,
                frequency: frequency,
                nextDueDate: nextDueDate,
                categoryType: categoryType?.isEmpty == true ? nil : categoryType
            )
            let payment = try await recurringService.createRecurringPayment(request)
            payments.append(payment)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Update Payment

    func updatePayment(id: Int, name: String?, amount: Decimal?, frequency: PaymentFrequency?, nextDueDate: Date?, categoryType: String? = nil) async {
        do {
            let request = UpdateRecurringRequest(
                id: id,
                name: name,
                amount: amount,
                frequency: frequency,
                nextDueDate: nextDueDate,
                categoryType: categoryType
            )
            let updated = try await recurringService.updateRecurringPayment(request)

            if let index = payments.firstIndex(where: { $0.id == id }) {
                payments[index] = updated
            }
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Delete Payment

    func deletePayment(id: Int) async {
        do {
            _ = try await recurringService.deleteRecurringPayment(id: id)
            payments.removeAll { $0.id == id }
            showToast("Payment deleted", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Contribute

    func contribute(paymentId: Int, amount: Decimal) async {
        do {
            let updated = try await recurringService.contribute(paymentId: paymentId, amount: amount)

            if let index = payments.firstIndex(where: { $0.id == paymentId }) {
                payments[index] = updated
            }
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Reset Funding

    func resetFunding(paymentId: Int) async {
        do {
            let updated = try await recurringService.resetFunding(paymentId: paymentId)

            if let index = payments.firstIndex(where: { $0.id == paymentId }) {
                payments[index] = updated
            }
            showToast("Marked as paid", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }
}
