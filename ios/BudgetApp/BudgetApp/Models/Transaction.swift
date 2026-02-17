import Foundation

struct Transaction: Codable, Identifiable, Equatable {
    let id: Int
    let budgetItemId: Int?
    let linkedAccountId: Int?
    let date: Date
    let description: String
    var amount: Decimal
    let type: TransactionType
    let merchant: String?
    let tellerId: String?
    let deletedAt: Date?
    var suggestedBudgetItemId: Int?
    let fromPreviousMonth: Bool?
    let isNonEarned: Bool
    var splits: [SplitTransaction]?

    var isDeleted: Bool {
        deletedAt != nil
    }

    var isSplit: Bool {
        splits != nil && !(splits?.isEmpty ?? true)
    }

    var displayAmount: String {
        Formatters.currency.string(from: amount as NSNumber) ?? "$0.00"
    }

    // Memberwise initializer for previews and testing
    init(id: Int, budgetItemId: Int? = nil, linkedAccountId: Int? = nil, date: Date = Date(), description: String, amount: Decimal, type: TransactionType, merchant: String? = nil, tellerId: String? = nil, deletedAt: Date? = nil, suggestedBudgetItemId: Int? = nil, fromPreviousMonth: Bool? = nil, isNonEarned: Bool = false, splits: [SplitTransaction]? = nil) {
        self.id = id
        self.budgetItemId = budgetItemId
        self.linkedAccountId = linkedAccountId
        self.date = date
        self.description = description
        self.amount = amount
        self.type = type
        self.merchant = merchant
        self.tellerId = tellerId
        self.deletedAt = deletedAt
        self.suggestedBudgetItemId = suggestedBudgetItemId
        self.fromPreviousMonth = fromPreviousMonth
        self.isNonEarned = isNonEarned
        self.splits = splits
    }

    enum CodingKeys: String, CodingKey {
        case id, budgetItemId, linkedAccountId, date, description, amount, type, merchant
        case tellerId, deletedAt, suggestedBudgetItemId, fromPreviousMonth, isNonEarned, splits
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        budgetItemId = try container.decodeIfPresent(Int.self, forKey: .budgetItemId)
        linkedAccountId = try container.decodeIfPresent(Int.self, forKey: .linkedAccountId)
        description = try container.decode(String.self, forKey: .description)
        type = try container.decode(TransactionType.self, forKey: .type)
        merchant = try container.decodeIfPresent(String.self, forKey: .merchant)
        tellerId = try container.decodeIfPresent(String.self, forKey: .tellerId)
        suggestedBudgetItemId = try container.decodeIfPresent(Int.self, forKey: .suggestedBudgetItemId)
        fromPreviousMonth = try container.decodeIfPresent(Bool.self, forKey: .fromPreviousMonth)
        isNonEarned = try container.decodeIfPresent(Bool.self, forKey: .isNonEarned) ?? false
        splits = try container.decodeIfPresent([SplitTransaction].self, forKey: .splits)

        // Handle numeric string from PostgreSQL
        if let amountString = try? container.decode(String.self, forKey: .amount) {
            amount = Decimal(string: amountString) ?? 0
        } else {
            amount = try container.decode(Decimal.self, forKey: .amount)
        }

        // Handle date - backend returns "YYYY-MM-DD" format, not full ISO8601
        let dateString = try container.decode(String.self, forKey: .date)
        if let parsedDate = Formatters.yearMonthDay.date(from: dateString) {
            date = parsedDate
        } else if let parsedDate = Formatters.iso8601.date(from: dateString) {
            date = parsedDate
        } else {
            throw DecodingError.dataCorruptedError(forKey: .date, in: container, debugDescription: "Cannot parse date: \(dateString)")
        }

        // Handle deletedAt - this uses full ISO8601 timestamp
        if let deletedAtString = try container.decodeIfPresent(String.self, forKey: .deletedAt) {
            deletedAt = Formatters.iso8601WithFractional.date(from: deletedAtString)
                ?? Formatters.iso8601.date(from: deletedAtString)
        } else {
            deletedAt = nil
        }
    }
}

enum TransactionType: String, Codable {
    case income
    case expense
}

struct SplitTransaction: Codable, Identifiable, Equatable {
    let id: Int
    let parentTransactionId: Int
    let budgetItemId: Int
    var amount: Decimal
    let description: String?
    let isNonEarned: Bool

    init(id: Int, parentTransactionId: Int, budgetItemId: Int, amount: Decimal, description: String? = nil, isNonEarned: Bool = false) {
        self.id = id
        self.parentTransactionId = parentTransactionId
        self.budgetItemId = budgetItemId
        self.amount = amount
        self.description = description
        self.isNonEarned = isNonEarned
    }

    enum CodingKeys: String, CodingKey {
        case id, parentTransactionId, budgetItemId, amount, description, isNonEarned
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        parentTransactionId = try container.decode(Int.self, forKey: .parentTransactionId)
        budgetItemId = try container.decode(Int.self, forKey: .budgetItemId)
        description = try container.decodeIfPresent(String.self, forKey: .description)
        isNonEarned = try container.decodeIfPresent(Bool.self, forKey: .isNonEarned) ?? false

        // Handle numeric string from PostgreSQL
        if let amountString = try? container.decode(String.self, forKey: .amount) {
            amount = Decimal(string: amountString) ?? 0
        } else {
            amount = try container.decode(Decimal.self, forKey: .amount)
        }
    }
}
