import Foundation
import Combine

@MainActor
class TransactionsViewModel: ObservableObject {
    @Published var transactions: [Transaction] = []
    @Published var isLoading = false
    @Published var error: String?

    private let transactionService = TransactionService.shared
    private let accountsService = AccountsService.shared

    // MARK: - Load Transactions

    func loadTransactions() async {
        isLoading = true
        error = nil

        let now = Date()
        let calendar = Calendar.current
        // Web app uses 0-indexed months (January=0), so subtract 1
        let month = calendar.component(.month, from: now) - 1
        let year = calendar.component(.year, from: now)

        do {
            transactions = try await accountsService.getUncategorizedTransactions(month: month, year: year)
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Create Transaction

    func createTransaction(budgetItemId: Int, date: Date, description: String, amount: Decimal, type: TransactionType, merchant: String?) async {
        do {
            let request = CreateTransactionRequest(
                budgetItemId: budgetItemId,
                date: date,
                description: description,
                amount: amount,
                type: type,
                merchant: merchant
            )
            _ = try await transactionService.createTransaction(request)
            await loadTransactions()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Update Transaction

    func updateTransaction(id: Int, budgetItemId: Int?, date: Date?, description: String?, amount: Decimal?, type: TransactionType?) async {
        do {
            let request = UpdateTransactionRequest(
                id: id,
                budgetItemId: budgetItemId,
                date: date,
                description: description,
                amount: amount,
                type: type
            )
            _ = try await transactionService.updateTransaction(request)
            await loadTransactions()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Delete Transaction

    func deleteTransaction(id: Int) async {
        do {
            _ = try await transactionService.deleteTransaction(id: id)
            await loadTransactions()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Restore Transaction

    func restoreTransaction(id: Int) async {
        do {
            _ = try await transactionService.restoreTransaction(id: id)
            await loadTransactions()
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Quick Categorize

    func categorizeTransaction(transactionId: Int, budgetItemId: Int) async {
        await updateTransaction(id: transactionId, budgetItemId: budgetItemId, date: nil, description: nil, amount: nil, type: nil)
    }
}
