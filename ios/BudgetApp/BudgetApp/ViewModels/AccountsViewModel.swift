import Foundation
import Combine

@MainActor
class AccountsViewModel: ObservableObject {
    @Published var accounts: [LinkedAccount] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var institutionToUnlink: String?
    @Published var selectedAccount: LinkedAccount?

    // Toast state for non-blocking feedback
    @Published var showToast = false
    @Published var toastMessage: String?
    @Published var isToastError = false

    private let accountsService = AccountsService.shared

    var groupedAccounts: [(key: String, value: [LinkedAccount])] {
        let grouped = Dictionary(grouping: accounts) { $0.institutionName }
        return grouped.sorted { $0.key < $1.key }
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

    // MARK: - Load Accounts

    func loadAccounts() async {
        error = nil

        // Load from cache first
        let cacheKey = "linked_accounts"
        if let cached: [LinkedAccount] = await CacheManager.shared.load(forKey: cacheKey) {
            accounts = cached
        }

        if accounts.isEmpty {
            isLoading = true
        }

        do {
            let fresh = try await accountsService.getLinkedAccounts()
            accounts = fresh
            await CacheManager.shared.save(fresh, forKey: cacheKey)
        } catch {
            if accounts.isEmpty {
                showToast(error.localizedDescription, isError: true)
            }
        }

        isLoading = false
    }

    // MARK: - Unlink Account

    func unlinkAccount(id: Int) async {
        guard requireOnline() else { return }
        do {
            _ = try await accountsService.unlinkAccount(id: id)
            accounts.removeAll { $0.id == id }
            await CacheManager.shared.save(accounts, forKey: "linked_accounts")
            showToast("Account unlinked", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }

    // MARK: - Unlink Institution (all accounts for a bank)

    func unlinkInstitution(name: String) async {
        guard requireOnline() else { return }
        let institutionAccounts = accounts.filter { $0.institutionName == name }
        var failCount = 0
        for account in institutionAccounts {
            do {
                _ = try await accountsService.unlinkAccount(id: account.id)
                accounts.removeAll { $0.id == account.id }
            } catch {
                failCount += 1
            }
        }
        await CacheManager.shared.save(accounts, forKey: "linked_accounts")
        if failCount > 0 {
            showToast("Failed to unlink \(failCount) account(s)", isError: true)
        } else {
            showToast("Institution removed", isError: false)
        }
    }

    // MARK: - Toggle Sync

    func toggleSync(account: LinkedAccount, enabled: Bool) async {
        guard requireOnline() else { return }
        do {
            let updated = try await accountsService.updateAccountSync(id: account.id, enabled: enabled)
            if let index = accounts.firstIndex(where: { $0.id == account.id }) {
                accounts[index] = updated
            }
            selectedAccount = updated
            showToast(enabled ? "Sync enabled" : "Sync disabled", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
            // Revert local state to match server
            await loadAccounts()
        }
    }

    // MARK: - Link Account (called after Teller Connect)

    func linkAccount(accessToken: String, enrollmentId: String) async {
        guard requireOnline() else { return }
        do {
            let newAccounts = try await accountsService.linkAccount(
                accessToken: accessToken,
                enrollmentId: enrollmentId
            )
            accounts.append(contentsOf: newAccounts)
            await CacheManager.shared.save(accounts, forKey: "linked_accounts")
            showToast("Account linked", isError: false)
        } catch {
            showToast(error.localizedDescription, isError: true)
        }
    }
}
