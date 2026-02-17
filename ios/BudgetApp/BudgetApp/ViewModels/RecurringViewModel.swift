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

    @Published private(set) var upcomingPayments: [RecurringPayment] = []

    private let recurringService = RecurringService.shared

    private func updateUpcomingPayments() {
        upcomingPayments = payments.filter { $0.isUpcoming && $0.isActive }
            .sorted { $0.nextDueDate < $1.nextDueDate }
    }

    // MARK: - Toast Helper

    private func showToast(_ message: String, isError: Bool) {
        toastMessage = message
        isToastError = isError
        showToast = true
    }

    private func requireOnline() -> Bool {
        guard NetworkMonitor.shared.isConnected else {
            showToast("You're offline. Connect to make changes.", isError: true)
            return false
        }
        return true
    }

    private func saveToCache() async {
        updateUpcomingPayments()
        await CacheManager.shared.save(payments, forKey: "recurring_payments")
    }

    // MARK: - Load Payments

    func loadPayments() async {
        error = nil

        // Load from cache first
        if let cached: [RecurringPayment] = await CacheManager.shared.load(forKey: "recurring_payments") {
            payments = cached
            updateUpcomingPayments()
        }

        if payments.isEmpty {
            isLoading = true
        }

        do {
            let fresh = try await recurringService.getRecurringPayments()
            payments = fresh
            await saveToCache()
        } catch {
            if payments.isEmpty {
                showToast(error.localizedDescription, isError: true)
            }
        }

        isLoading = false
    }

    // MARK: - Create Payment

    func createPayment(name: String, amount: Decimal, frequency: PaymentFrequency, nextDueDate: Date, categoryType: String?) async {
        guard requireOnline() else { return }
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
            await saveToCache()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Update Payment

    func updatePayment(id: Int, name: String?, amount: Decimal?, frequency: PaymentFrequency?, nextDueDate: Date?, categoryType: String? = nil) async {
        guard requireOnline() else { return }
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
            await saveToCache()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Delete Payment

    func deletePayment(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await recurringService.deleteRecurringPayment(id: id)
            payments.removeAll { $0.id == id }
            await saveToCache()
            showToast("Payment deleted", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Contribute

    func contribute(paymentId: Int, amount: Decimal) async {
        guard requireOnline() else { return }
        do {
            let updated = try await recurringService.contribute(paymentId: paymentId, amount: amount)

            if let index = payments.firstIndex(where: { $0.id == paymentId }) {
                payments[index] = updated
            }
            await saveToCache()
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Reset Funding

    func resetFunding(paymentId: Int) async {
        guard requireOnline() else { return }
        do {
            let updated = try await recurringService.resetFunding(paymentId: paymentId)

            if let index = payments.firstIndex(where: { $0.id == paymentId }) {
                payments[index] = updated
            }
            await saveToCache()
            showToast("Marked as paid", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }
}
