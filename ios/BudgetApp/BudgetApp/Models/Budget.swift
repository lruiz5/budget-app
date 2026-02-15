import Foundation

// MARK: - Budget Models
// These mirror the TypeScript types from types/budget.ts

struct Budget: Codable, Identifiable {
    let id: Int
    let userId: String
    let month: Int
    let year: Int
    let buffer: Decimal
    let createdAt: Date
    var categories: [String: BudgetCategory]

    // Returns category keys sorted: income first, then defaults by order, then custom, then saving last
    var sortedCategoryKeys: [String] {
        let defaultOrder = ["income", "giving", "household", "transportation", "food", "personal", "insurance", "saving"]

        return categories.keys.sorted { key1, key2 in
            let isDefault1 = defaultOrder.contains(key1.lowercased())
            let isDefault2 = defaultOrder.contains(key2.lowercased())

            // Income always first
            if key1.lowercased() == "income" { return true }
            if key2.lowercased() == "income" { return false }

            // Saving always last
            if key1.lowercased() == "saving" { return false }
            if key2.lowercased() == "saving" { return true }

            // Default categories come before custom
            if isDefault1 && !isDefault2 { return true }
            if !isDefault1 && isDefault2 { return false }

            // Within defaults, use predefined order
            if isDefault1 && isDefault2 {
                let index1 = defaultOrder.firstIndex(of: key1.lowercased()) ?? 999
                let index2 = defaultOrder.firstIndex(of: key2.lowercased()) ?? 999
                return index1 < index2
            }

            // Custom categories sorted by their order property
            let order1 = categories[key1]?.order ?? 999
            let order2 = categories[key2]?.order ?? 999
            return order1 < order2
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, userId, month, year, buffer, createdAt, categories
    }

    // Memberwise initializer for previews and testing
    init(id: Int, userId: String, month: Int, year: Int, buffer: Decimal, createdAt: Date, categories: [String: BudgetCategory]) {
        self.id = id
        self.userId = userId
        self.month = month
        self.year = year
        self.buffer = buffer
        self.createdAt = createdAt
        self.categories = categories
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(userId, forKey: .userId)
        try container.encode(month, forKey: .month)
        try container.encode(year, forKey: .year)
        try container.encode(buffer, forKey: .buffer)
        try container.encode(createdAt, forKey: .createdAt)
        // Encode categories as array — decoder expects array and converts to dict
        try container.encode(Array(categories.values), forKey: .categories)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        userId = try container.decode(String.self, forKey: .userId)
        month = try container.decode(Int.self, forKey: .month)
        year = try container.decode(Int.self, forKey: .year)

        // Handle createdAt - may have fractional seconds
        let createdAtString = try container.decode(String.self, forKey: .createdAt)
        let iso8601Formatter = ISO8601DateFormatter()
        iso8601Formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsedDate = iso8601Formatter.date(from: createdAtString) {
            createdAt = parsedDate
        } else {
            // Try without fractional seconds
            iso8601Formatter.formatOptions = [.withInternetDateTime]
            if let parsedDate = iso8601Formatter.date(from: createdAtString) {
                createdAt = parsedDate
            } else {
                throw DecodingError.dataCorruptedError(forKey: .createdAt, in: container, debugDescription: "Cannot parse date: \(createdAtString)")
            }
        }

        // Handle numeric string from PostgreSQL
        if let bufferString = try? container.decode(String.self, forKey: .buffer) {
            buffer = Decimal(string: bufferString) ?? 0
        } else {
            buffer = try container.decode(Decimal.self, forKey: .buffer)
        }

        // API returns categories as an array, convert to dictionary keyed by categoryType
        let categoriesArray = try container.decode([BudgetCategory].self, forKey: .categories)
        categories = Dictionary(uniqueKeysWithValues: categoriesArray.map { ($0.categoryType, $0) })
    }
}

struct BudgetCategory: Codable, Identifiable {
    let id: Int
    let budgetId: Int
    let categoryType: String
    let name: String
    let order: Int
    let emoji: String?
    var items: [BudgetItem]
    var planned: Decimal
    var actual: Decimal

    var displayName: String {
        if let emoji = emoji {
            return "\(emoji) \(name)"
        }
        return "\(categoryEmoji) \(name)"
    }

    var categoryEmoji: String {
        switch categoryType.lowercased() {
        case "income": return "💰"
        case "giving": return "🤲"
        case "household": return "🏠"
        case "transportation": return "🚗"
        case "food": return "🍽️"
        case "personal": return "👤"
        case "insurance": return "🛡️"
        case "saving": return "💵"
        default: return emoji ?? "📁"
        }
    }

    // Memberwise initializer for previews and testing
    init(id: Int, budgetId: Int, categoryType: String, name: String, order: Int, emoji: String? = nil, items: [BudgetItem] = [], planned: Decimal = 0, actual: Decimal = 0) {
        self.id = id
        self.budgetId = budgetId
        self.categoryType = categoryType
        self.name = name
        self.order = order
        self.emoji = emoji
        self.items = items
        self.planned = planned
        self.actual = actual
    }

    enum CodingKeys: String, CodingKey {
        case id, budgetId, categoryType, name, emoji, items, planned, actual
        case order = "categoryOrder"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(budgetId, forKey: .budgetId)
        try container.encode(categoryType, forKey: .categoryType)
        try container.encode(name, forKey: .name)
        try container.encode(order, forKey: .order) // Encodes under "categoryOrder" key
        try container.encodeIfPresent(emoji, forKey: .emoji)
        try container.encode(items, forKey: .items)
        try container.encode(planned, forKey: .planned)
        try container.encode(actual, forKey: .actual)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        budgetId = try container.decode(Int.self, forKey: .budgetId)
        categoryType = try container.decode(String.self, forKey: .categoryType)
        name = try container.decode(String.self, forKey: .name)
        order = try container.decodeIfPresent(Int.self, forKey: .order) ?? 0
        emoji = try container.decodeIfPresent(String.self, forKey: .emoji)

        // Decode items first
        var decodedItems = try container.decodeIfPresent([BudgetItem].self, forKey: .items) ?? []

        // Calculate actual for each item based on category type
        let isIncomeCategory = categoryType.lowercased() == "income"
        for i in decodedItems.indices {
            decodedItems[i].calculateActual(isIncomeCategory: isIncomeCategory)
        }
        items = decodedItems

        // Calculate planned from items
        planned = items.reduce(0) { $0 + $1.planned }

        // Calculate actual from items (now that they have calculated values)
        actual = items.reduce(0) { $0 + $1.actual }
    }
}

struct BudgetItem: Codable, Identifiable {
    let id: Int
    let categoryId: Int
    let name: String
    var planned: Decimal
    var actual: Decimal
    let order: Int
    let recurringPaymentId: Int?
    var transactions: [Transaction]
    var splitTransactions: [SplitTransactionWithParent]?

    var remaining: Decimal {
        planned - actual
    }

    var progress: Double {
        guard planned > 0 else { return 0 }
        return Double(truncating: (actual / planned) as NSNumber)
    }

    var isOverBudget: Bool {
        actual > planned
    }

    // Memberwise initializer for previews and testing
    init(id: Int, categoryId: Int, name: String, planned: Decimal, actual: Decimal = 0, order: Int = 0, recurringPaymentId: Int? = nil, transactions: [Transaction] = [], splitTransactions: [SplitTransactionWithParent]? = nil) {
        self.id = id
        self.categoryId = categoryId
        self.name = name
        self.planned = planned
        self.actual = actual
        self.order = order
        self.recurringPaymentId = recurringPaymentId
        self.transactions = transactions
        self.splitTransactions = splitTransactions
    }

    enum CodingKeys: String, CodingKey {
        case id, categoryId, name, planned, actual, order, recurringPaymentId, transactions, splitTransactions
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(categoryId, forKey: .categoryId)
        try container.encode(name, forKey: .name)
        try container.encode(planned, forKey: .planned)
        try container.encode(actual, forKey: .actual)
        try container.encode(order, forKey: .order)
        try container.encodeIfPresent(recurringPaymentId, forKey: .recurringPaymentId)
        try container.encode(transactions, forKey: .transactions)
        try container.encodeIfPresent(splitTransactions, forKey: .splitTransactions)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        categoryId = try container.decode(Int.self, forKey: .categoryId)
        name = try container.decode(String.self, forKey: .name)
        order = try container.decode(Int.self, forKey: .order)
        recurringPaymentId = try container.decodeIfPresent(Int.self, forKey: .recurringPaymentId)
        transactions = try container.decodeIfPresent([Transaction].self, forKey: .transactions) ?? []
        splitTransactions = try container.decodeIfPresent([SplitTransactionWithParent].self, forKey: .splitTransactions)

        // Handle numeric strings from PostgreSQL
        if let plannedString = try? container.decode(String.self, forKey: .planned) {
            planned = Decimal(string: plannedString) ?? 0
        } else {
            planned = try container.decode(Decimal.self, forKey: .planned)
        }

        // actual will be calculated after decoding based on category type
        // Set to 0 here, will be recalculated in BudgetCategory
        actual = 0
    }

    // Calculate actual based on category type (income vs expense)
    mutating func calculateActual(isIncomeCategory: Bool) {
        // Filter out soft-deleted transactions
        let activeTransactions = transactions.filter { !$0.isDeleted }

        // Calculate from direct transactions
        let directActual: Decimal = activeTransactions.reduce(0) { sum, t in
            let amt = t.amount
            if isIncomeCategory {
                return t.type == .income ? sum + amt : sum - amt
            } else {
                return t.type == .expense ? sum + amt : sum - amt
            }
        }

        // Calculate from split transactions
        let splitActual: Decimal = (splitTransactions ?? []).reduce(0) { sum, s in
            let amt = s.amount
            if isIncomeCategory {
                return s.parentType == .income ? sum + amt : sum - amt
            } else {
                return s.parentType == .expense ? sum + amt : sum - amt
            }
        }

        actual = directActual + splitActual
    }
}

// Split transaction with parent info for actual calculation
struct SplitTransactionWithParent: Codable, Identifiable {
    let id: Int
    let parentTransactionId: Int
    let budgetItemId: Int
    var amount: Decimal
    let description: String?
    let isNonEarned: Bool
    let parentType: TransactionType?
    let parentTransaction: Transaction?

    enum CodingKeys: String, CodingKey {
        case id, parentTransactionId, budgetItemId, amount, description, isNonEarned, parentTransaction
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        try container.encode(parentTransactionId, forKey: .parentTransactionId)
        try container.encode(budgetItemId, forKey: .budgetItemId)
        try container.encode(amount, forKey: .amount)
        try container.encodeIfPresent(description, forKey: .description)
        try container.encode(isNonEarned, forKey: .isNonEarned)
        try container.encodeIfPresent(parentTransaction, forKey: .parentTransaction)
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

        // Decode full parent transaction (includes type, date, description, amount, etc.)
        parentTransaction = try container.decodeIfPresent(Transaction.self, forKey: .parentTransaction)
        parentType = parentTransaction?.type
    }
}
