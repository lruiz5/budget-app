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

    func getDeletedTransactions(month: Int, year: Int) async throws -> [Transaction] {
        try await api.get("/api/transactions", queryParams: [
            "deleted": "true",
            "month": String(month),
            "year": String(year)
        ])
    }

    // MARK: - Split Transactions

    func getSplits(parentTransactionId: Int) async throws -> [SplitTransaction] {
        try await api.get("/api/transactions/split", queryParams: [
            "transactionId": String(parentTransactionId)
        ])
    }

    func createSplits(_ request: CreateSplitsRequest) async throws -> [SplitTransaction] {
        let response: CreateSplitsResponse = try await api.post("/api/transactions/split", body: request)
        return response.splits
    }

    func deleteSplits(parentTransactionId: Int, budgetItemId: Int? = nil) async throws -> SuccessResponse {
        var params: [String: String] = ["transactionId": String(parentTransactionId)]
        if let itemId = budgetItemId {
            params["budgetItemId"] = String(itemId)
        }
        return try await api.delete("/api/transactions/split", queryParams: params)
    }
}

// MARK: - Request Types

struct CreateTransactionRequest: Encodable {
    let budgetItemId: Int
    let date: String
    let description: String
    let amount: String
    let type: String
    let merchant: String?
    let isNonEarned: Bool?
    let tagCategoryType: String?

    init(budgetItemId: Int, date: Date, description: String, amount: Decimal, type: TransactionType, merchant: String? = nil, isNonEarned: Bool = false, tagCategoryType: String? = nil) {
        self.budgetItemId = budgetItemId
        self.date = Formatters.yearMonthDay.string(from: date)
        self.description = description
        self.amount = String(describing: amount)
        self.type = type.rawValue
        self.merchant = merchant
        self.isNonEarned = isNonEarned ? true : nil
        self.tagCategoryType = tagCategoryType
    }
}

struct UpdateTransactionRequest: Encodable {
    let id: Int
    let budgetItemId: Int?
    let clearBudgetItemId: Bool
    let date: String?
    let description: String?
    let amount: String?
    let type: String?
    let merchant: String?
    let isNonEarned: Bool?
    let tagCategoryType: String?

    enum CodingKeys: String, CodingKey {
        case id, budgetItemId, date, description, amount, type, merchant, isNonEarned, tagCategoryType
    }

    // Custom encoding to OMIT nil fields (not encode as null)
    // The API checks `if (field !== undefined)` — null would still trigger updates
    // clearBudgetItemId sends explicit null to uncategorize
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        if clearBudgetItemId {
            try container.encodeNil(forKey: .budgetItemId)
        } else {
            try container.encodeIfPresent(budgetItemId, forKey: .budgetItemId)
        }
        try container.encodeIfPresent(date, forKey: .date)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encodeIfPresent(amount, forKey: .amount)
        try container.encodeIfPresent(type, forKey: .type)
        try container.encodeIfPresent(merchant, forKey: .merchant)
        try container.encodeIfPresent(isNonEarned, forKey: .isNonEarned)
        try container.encodeIfPresent(tagCategoryType, forKey: .tagCategoryType)
    }

    init(id: Int, budgetItemId: Int? = nil, clearBudgetItemId: Bool = false, date: Date? = nil, description: String? = nil, amount: Decimal? = nil, type: TransactionType? = nil, merchant: String? = nil, isNonEarned: Bool? = nil, tagCategoryType: String? = nil) {
        self.id = id
        self.budgetItemId = budgetItemId
        self.clearBudgetItemId = clearBudgetItemId
        if let date = date {
            self.date = Formatters.yearMonthDay.string(from: date)
        } else {
            self.date = nil
        }
        self.description = description
        self.amount = amount.map { String(describing: $0) }
        self.type = type?.rawValue
        self.merchant = merchant
        self.isNonEarned = isNonEarned
        self.tagCategoryType = tagCategoryType
    }
}

struct RestoreTransactionRequest: Encodable {
    let id: Int
    let action: String = "restore"
}

struct CreateSplitsResponse: Decodable {
    let success: Bool
    let splits: [SplitTransaction]
}

struct CreateSplitsRequest: Encodable {
    let parentTransactionId: Int
    let splits: [SplitInput]

    enum CodingKeys: String, CodingKey {
        case parentTransactionId = "transactionId"
        case splits
    }
}

struct SplitInput: Encodable {
    let budgetItemId: Int
    let amount: Decimal
    let description: String?
    let isNonEarned: Bool?
}
