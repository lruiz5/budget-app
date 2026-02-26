import Foundation

struct CategoryRingItem: Codable {
    let categoryType: String
    let name: String
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

    // Backward-compatible decoding for cached data without `name` field
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        categoryType = try container.decode(String.self, forKey: .categoryType)
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? categoryType.capitalized
        emoji = try container.decode(String.self, forKey: .emoji)
        planned = try container.decode(Decimal.self, forKey: .planned)
        actual = try container.decode(Decimal.self, forKey: .actual)
    }

    init(categoryType: String, name: String, emoji: String, planned: Decimal, actual: Decimal) {
        self.categoryType = categoryType
        self.name = name
        self.emoji = emoji
        self.planned = planned
        self.actual = actual
    }
}

struct CategoryRingsData: Codable {
    let rings: [CategoryRingItem]
    let priorityRings: [CategoryRingItem]
    let monthLabel: String
    let lastUpdated: Date

    // Backward-compatible decoding for cached data without `priorityRings`
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        rings = try container.decode([CategoryRingItem].self, forKey: .rings)
        priorityRings = try container.decodeIfPresent([CategoryRingItem].self, forKey: .priorityRings) ?? rings
        monthLabel = try container.decode(String.self, forKey: .monthLabel)
        lastUpdated = try container.decode(Date.self, forKey: .lastUpdated)
    }

    init(rings: [CategoryRingItem], priorityRings: [CategoryRingItem], monthLabel: String, lastUpdated: Date) {
        self.rings = rings
        self.priorityRings = priorityRings
        self.monthLabel = monthLabel
        self.lastUpdated = lastUpdated
    }
}
