import Foundation

struct BudgetItemRingItem: Codable {
    let id: Int             // budget item ID
    let name: String        // "Personal Spending Money"
    let categoryName: String // "Personal"
    let categoryEmoji: String
    let planned: Decimal
    let actual: Decimal
    let avatarKey: String?  // key for custom avatar image in App Group container

    var remaining: Decimal { max(planned - actual, 0) }
    var progress: Double {
        guard planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (actual / planned) as NSNumber))
    }
    var isOver: Bool { actual > planned && planned > 0 }

    init(id: Int, name: String, categoryName: String, categoryEmoji: String, planned: Decimal, actual: Decimal, avatarKey: String? = nil) {
        self.id = id
        self.name = name
        self.categoryName = categoryName
        self.categoryEmoji = categoryEmoji
        self.planned = planned
        self.actual = actual
        self.avatarKey = avatarKey
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        categoryName = try container.decode(String.self, forKey: .categoryName)
        categoryEmoji = try container.decode(String.self, forKey: .categoryEmoji)
        planned = try container.decode(Decimal.self, forKey: .planned)
        actual = try container.decode(Decimal.self, forKey: .actual)
        avatarKey = try container.decodeIfPresent(String.self, forKey: .avatarKey)
    }
}

struct BudgetItemRingsData: Codable {
    let items: [BudgetItemRingItem]
    let monthLabel: String
    let lastUpdated: Date
}
