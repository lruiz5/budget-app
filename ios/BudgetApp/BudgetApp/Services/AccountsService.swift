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

    func linkAccount(accessToken: String, enrollmentId: String) async throws -> [LinkedAccount] {
        let response: LinkedAccountsResponse = try await api.post("/api/teller/accounts", body: LinkAccountRequest(
            accessToken: accessToken,
            enrollment: EnrollmentId(id: enrollmentId)
        ))
        return response.accounts
    }

    func unlinkAccount(id: Int) async throws -> SuccessResponse {
        try await api.delete("/api/teller/accounts", queryParams: ["id": String(id)])
    }

    // MARK: - Account Settings

    func updateAccountSync(id: Int, enabled: Bool) async throws -> LinkedAccount {
        try await api.patch("/api/teller/accounts", body: UpdateSyncRequest(id: id, syncEnabled: enabled))
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
    let enrollment: EnrollmentId
}

struct EnrollmentId: Encodable {
    let id: String
}

struct UpdateSyncRequest: Encodable {
    let id: Int
    let syncEnabled: Bool
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
