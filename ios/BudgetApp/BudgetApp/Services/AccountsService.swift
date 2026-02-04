import Foundation

// MARK: - Accounts Service
// API methods for linked bank accounts (Teller integration)

actor AccountsService {
    static let shared = AccountsService()
    private let api = APIClient.shared

    private init() {}

    // MARK: - Linked Accounts

    func getLinkedAccounts() async throws -> [LinkedAccount] {
        try await api.get("/api/teller/accounts")
    }

    func linkAccount(accessToken: String, accountId: String, institutionName: String, accountName: String, accountType: String, accountSubtype: String?, lastFour: String?) async throws -> LinkedAccount {
        try await api.post("/api/teller/accounts", body: LinkAccountRequest(
            accessToken: accessToken,
            accountId: accountId,
            institutionName: institutionName,
            accountName: accountName,
            accountType: accountType,
            accountSubtype: accountSubtype,
            lastFour: lastFour
        ))
    }

    func unlinkAccount(id: Int) async throws -> SuccessResponse {
        try await api.delete("/api/teller/accounts", queryParams: ["id": String(id)])
    }

    // MARK: - Transaction Sync

    func getUncategorizedTransactions(month: Int, year: Int) async throws -> [Transaction] {
        try await api.get("/api/teller/sync", queryParams: [
            "month": String(month),
            "year": String(year)
        ])
    }

    func syncTransactions() async throws -> SyncResponse {
        try await api.post("/api/teller/sync", body: SyncRequest())
    }
}

// MARK: - Request Types

struct LinkAccountRequest: Encodable {
    let accessToken: String
    let accountId: String
    let institutionName: String
    let accountName: String
    let accountType: String
    let accountSubtype: String?
    let lastFour: String?
}

struct SyncRequest: Encodable {
    // Optional parameters for sync
    let accountId: Int?
    let startDate: String?
    let endDate: String?

    init(accountId: Int? = nil, startDate: String? = nil, endDate: String? = nil) {
        self.accountId = accountId
        self.startDate = startDate
        self.endDate = endDate
    }
}

struct SyncResponse: Decodable {
    // Matches backend response: { synced, updated, skipped, errors }
    let synced: Int
    let updated: Int?
    let skipped: Int?
    let errors: [String]?
}
