import Foundation
import Combine

@MainActor
class AccountsViewModel: ObservableObject {
    @Published var accounts: [LinkedAccount] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var institutionToUnlink: String?
    @Published var selectedAccount: LinkedAccount?

    private let accountsService = AccountsService.shared

    var groupedAccounts: [(key: String, value: [LinkedAccount])] {
        let grouped = Dictionary(grouping: accounts) { $0.institutionName }
        return grouped.sorted { $0.key < $1.key }
    }

    // MARK: - Load Accounts

    func loadAccounts() async {
        isLoading = true
        error = nil

        do {
            accounts = try await accountsService.getLinkedAccounts()
        } catch let apiError as APIError {
            error = apiError.errorDescription
        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }

    // MARK: - Unlink Account

    func unlinkAccount(id: Int) async {
        do {
            _ = try await accountsService.unlinkAccount(id: id)
            accounts.removeAll { $0.id == id }
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Unlink Institution (all accounts for a bank)

    func unlinkInstitution(name: String) async {
        let institutionAccounts = accounts.filter { $0.institutionName == name }
        for account in institutionAccounts {
            do {
                _ = try await accountsService.unlinkAccount(id: account.id)
                accounts.removeAll { $0.id == account.id }
            } catch {
                self.error = error.localizedDescription
                return
            }
        }
    }

    // MARK: - Toggle Sync

    func toggleSync(account: LinkedAccount, enabled: Bool) async {
        do {
            let updated = try await accountsService.updateAccountSync(id: account.id, enabled: enabled)
            if let index = accounts.firstIndex(where: { $0.id == account.id }) {
                accounts[index] = updated
            }
            selectedAccount = updated
        } catch {
            self.error = error.localizedDescription
        }
    }

    // MARK: - Link Account (called after Teller Connect)

    func linkAccount(accessToken: String, enrollmentId: String) async {
        do {
            let newAccounts = try await accountsService.linkAccount(
                accessToken: accessToken,
                enrollmentId: enrollmentId
            )
            accounts.append(contentsOf: newAccounts)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
