import Foundation

struct BudgetItemRingItem: Codable {
    let id: Int             // budget item ID
    let name: String        // "Personal Spending Money"
    let categoryName: String // "Personal"
    let categoryEmoji: String
    let planned: Decimal
    let actual: Decimal

    var remaining: Decimal { max(planned - actual, 0) }
    var progress: Double {
        guard planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (actual / planned) as NSNumber))
    }
    var isOver: Bool { actual > planned && planned > 0 }
}

struct BudgetItemRingsData: Codable {
    let items: [BudgetItemRingItem]
    let monthLabel: String
    let lastUpdated: Date
}
