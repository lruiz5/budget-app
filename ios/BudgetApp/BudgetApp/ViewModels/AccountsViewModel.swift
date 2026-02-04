import Foundation
import Combine

@MainActor
class AccountsViewModel: ObservableObject {
    @Published var accounts: [LinkedAccount] = []
    @Published var isLoading = false
    @Published var isSyncing = false
    @Published var error: String?
    @Published var showSyncAlert = false
    @Published var syncMessage = ""

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

    // MARK: - Sync All Accounts

    func syncAllAccounts() async {
        isSyncing = true
        error = nil

        do {
            let response = try await accountsService.syncTransactions()
            let updated = response.updated ?? 0
            let skipped = response.skipped ?? 0
            syncMessage = "Synced \(response.synced) new, \(updated) updated, \(skipped) unchanged"
            showSyncAlert = true
        } catch let apiError as APIError {
            error = apiError.errorDescription
            syncMessage = "Sync failed: \(apiError.errorDescription ?? "Unknown error")"
            showSyncAlert = true
        } catch {
            self.error = error.localizedDescription
            syncMessage = "Sync failed: \(error.localizedDescription)"
            showSyncAlert = true
        }

        isSyncing = false
    }

    // MARK: - Link Account (called after Teller Connect)

    func linkAccount(accessToken: String, accountId: String, institutionName: String, accountName: String, accountType: String, accountSubtype: String?, lastFour: String?) async {
        do {
            let account = try await accountsService.linkAccount(
                accessToken: accessToken,
                accountId: accountId,
                institutionName: institutionName,
                accountName: accountName,
                accountType: accountType,
                accountSubtype: accountSubtype,
                lastFour: lastFour
            )
            accounts.append(account)
        } catch {
            self.error = error.localizedDescription
        }
    }
}
