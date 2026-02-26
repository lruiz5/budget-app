import Foundation

struct LatestTransactionsData: Codable {
    let transactions: [WidgetTransaction]
    let lastUpdated: Date
}

struct WidgetTransaction: Codable, Identifiable {
    let id: Int
    let description: String   // merchant or description
    let amount: Decimal
    let type: String          // "income" or "expense"
    let date: String          // "Feb 24" pre-formatted
}
