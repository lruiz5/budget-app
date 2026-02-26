import Foundation
import WidgetKit

enum WidgetDataManager {
    private static let suiteName = "group.com.happytusk.app"
    private static let spendingPaceKey = "spending_pace_data"
    private static let latestTransactionsKey = "latest_transactions_data"

    // MARK: - Spending Pace

    static func write(_ data: SpendingPaceData) {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let encoded = try? encoder.encode(data) else { return }
        defaults.set(encoded, forKey: spendingPaceKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "SpendingPaceWidget")
    }

    static func read() -> SpendingPaceData? {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: spendingPaceKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(SpendingPaceData.self, from: data)
    }

    // MARK: - Latest Transactions

    static func writeTransactions(_ data: LatestTransactionsData) {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return }
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        guard let encoded = try? encoder.encode(data) else { return }
        defaults.set(encoded, forKey: latestTransactionsKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "LatestTransactionsWidget")
    }

    static func readTransactions() -> LatestTransactionsData? {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: latestTransactionsKey) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(LatestTransactionsData.self, from: data)
    }
}
