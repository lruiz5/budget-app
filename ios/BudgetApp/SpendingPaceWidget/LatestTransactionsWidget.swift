import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct LatestTransactionsEntry: TimelineEntry {
    let date: Date
    let data: LatestTransactionsData?
}

// MARK: - Timeline Provider

struct LatestTransactionsProvider: TimelineProvider {
    func placeholder(in context: Context) -> LatestTransactionsEntry {
        LatestTransactionsEntry(date: .now, data: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (LatestTransactionsEntry) -> Void) {
        if context.isPreview {
            completion(LatestTransactionsEntry(date: .now, data: .preview))
        } else {
            completion(LatestTransactionsEntry(date: .now, data: WidgetDataManager.readTransactions()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LatestTransactionsEntry>) -> Void) {
        let entry = LatestTransactionsEntry(date: .now, data: WidgetDataManager.readTransactions())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - Widget Configuration

struct LatestTransactionsWidget: Widget {
    let kind = "LatestTransactionsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LatestTransactionsProvider()) { entry in
            LatestTransactionsWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://budget"))
        }
        .configurationDisplayName("Uncategorized")
        .description("See transactions that need to be categorized.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Preview Data

extension LatestTransactionsData {
    static let preview = LatestTransactionsData(
        transactions: [
            WidgetTransaction(id: 1, description: "Chipotle", amount: 12.45, type: "expense", date: "Feb 25"),
            WidgetTransaction(id: 2, description: "Paycheck", amount: 2400, type: "income", date: "Feb 23"),
            WidgetTransaction(id: 3, description: "Electric Bill", amount: 89.00, type: "expense", date: "Feb 22"),
            WidgetTransaction(id: 4, description: "Shell Gas", amount: 45.67, type: "expense", date: "Feb 21"),
        ],
        lastUpdated: .now
    )
}
