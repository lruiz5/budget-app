import Foundation
import Combine

@MainActor
class RecurringViewModel: ObservableObject {
    @Published var payments: [RecurringPayment] = []
    @Published var isLoading = false
    @Published var error: String?

    private let recurringService = RecurringService.shared

    var upcomingPayments: [RecurringPayment] {
        payments.filter { $0.isUpcoming && $0.isActive }
            .sorted { $0.nextDueDate < $1.nextDueDate }
    }

    // MARK: - Load Payments

    func loadPayments() async {
        isLoading = true
        error = nil

        do {
            payments = try await recurringService.getRecurringPayments()
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
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
            self.error = error.localizedDescription
        }
    }

    // MARK: - Update Payment

    func updatePayment(id: Int, name: String?, amount: Decimal?, frequency: PaymentFrequency?, nextDueDate: Date?) async {
        do {
            let request = UpdateRecurringRequest(
                id: id,
                name: name,
                amount: amount,
                frequency: frequency,
                nextDueDate: nextDueDate
            )
            let updated = try await recurringService.updateRecurringPayment(request)

            if let index = payments.firstIndex(where: { $0.id == id }) {
                payments[index] = updated
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Delete Payment

    func deletePayment(id: Int) async {
        do {
            _ = try await recurringService.deleteRecurringPayment(id: id)
            payments.removeAll { $0.id == id }
        } catch {
            self.error = error.localizedDescription
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
            self.error = error.localizedDescription
        }
    }

    // MARK: - Reset Funding

    func resetFunding(paymentId: Int) async {
        do {
            let updated = try await recurringService.resetFunding(paymentId: paymentId)

            if let index = payments.firstIndex(where: { $0.id == paymentId }) {
                payments[index] = updated
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}
