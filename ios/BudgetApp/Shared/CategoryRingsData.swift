import Foundation

struct CategoryRingItem: Codable {
    let categoryType: String
    let emoji: String
    let planned: Decimal
    let actual: Decimal

    var remaining: Decimal {
        max(planned - actual, 0)
    }

    var progress: Double {
        guard planned > 0 else { return 0 }
        return min(1.0, Double(truncating: (actual / planned) as NSNumber))
    }

    var isOver: Bool {
        actual > planned && planned > 0
    }
}

struct CategoryRingsData: Codable {
    let rings: [CategoryRingItem]
    let monthLabel: String
    let lastUpdated: Date
}
