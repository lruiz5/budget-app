import Foundation

// MARK: - Transaction Service
// API methods for transaction-related endpoints

actor TransactionService {
    static let shared = TransactionService()
    private let api = APIClient.shared

    private init() {}

    // MARK: - Transactions

    func getTransactions(budgetItemId: Int? = nil) async throws -> [Transaction] {
        var params: [String: String] = [:]
        if let itemId = budgetItemId {
            params["budgetItemId"] = String(itemId)
        }
        return try await api.get("/api/transactions", queryParams: params.isEmpty ? nil : params)
    }

    func createTransaction(_ request: CreateTransactionRequest) async throws -> Transaction {
        try await api.post("/api/transactions", body: request)
    }

    func updateTransaction(_ request: UpdateTransactionRequest) async throws -> Transaction {
        try await api.put("/api/transactions", body: request)
    }

    func deleteTransaction(id: Int) async throws -> SuccessResponse {
        try await api.delete("/api/transactions", queryParams: ["id": String(id)])
    }

    func restoreTransaction(id: Int) async throws -> Transaction {
        try await api.patch("/api/transactions", body: RestoreTransactionRequest(id: id))
    }

    // MARK: - Split Transactions

    func getSplits(parentTransactionId: Int) async throws -> [SplitTransaction] {
        try await api.get("/api/transactions/split", queryParams: [
            "parentTransactionId": String(parentTransactionId)
        ])
    }

    func createSplits(_ request: CreateSplitsRequest) async throws -> [SplitTransaction] {
        try await api.post("/api/transactions/split", body: request)
    }

    func deleteSplits(parentTransactionId: Int) async throws -> SuccessResponse {
        try await api.delete("/api/transactions/split", queryParams: [
            "parentTransactionId": String(parentTransactionId)
        ])
    }
}

// MARK: - Request Types

struct CreateTransactionRequest: Encodable {
    let budgetItemId: Int
    let date: Date
    let description: String
    let amount: String
    let type: String
    let merchant: String?

    init(budgetItemId: Int, date: Date, description: String, amount: Decimal, type: TransactionType, merchant: String? = nil) {
        self.budgetItemId = budgetItemId
        self.date = date
        self.description = description
        self.amount = String(describing: amount)
        self.type = type.rawValue
        self.merchant = merchant
    }
}

struct UpdateTransactionRequest: Encodable {
    let id: Int
    let budgetItemId: Int?
    let date: Date?
    let description: String?
    let amount: String?
    let type: String?
    let merchant: String?

    init(id: Int, budgetItemId: Int? = nil, date: Date? = nil, description: String? = nil, amount: Decimal? = nil, type: TransactionType? = nil, merchant: String? = nil) {
        self.id = id
        self.budgetItemId = budgetItemId
        self.date = date
        self.description = description
        self.amount = amount.map { String(describing: $0) }
        self.type = type?.rawValue
        self.merchant = merchant
    }
}

struct RestoreTransactionRequest: Encodable {
    let id: Int
    let action: String = "restore"
}

struct CreateSplitsRequest: Encodable {
    let parentTransactionId: Int
    let splits: [SplitInput]
}

struct SplitInput: Encodable {
    let budgetItemId: Int
    let amount: String
    let description: String?

    init(budgetItemId: Int, amount: Decimal, description: String? = nil) {
        self.budgetItemId = budgetItemId
        self.amount = String(describing: amount)
        self.description = description
    }
}
