import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct SpendingPaceEntry: TimelineEntry {
    let date: Date
    let data: SpendingPaceData?
}

// MARK: - Timeline Provider

struct SpendingPaceProvider: TimelineProvider {
    func placeholder(in context: Context) -> SpendingPaceEntry {
        SpendingPaceEntry(date: .now, data: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (SpendingPaceEntry) -> Void) {
        if context.isPreview {
            completion(SpendingPaceEntry(date: .now, data: .preview))
        } else {
            completion(SpendingPaceEntry(date: .now, data: WidgetDataManager.read()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SpendingPaceEntry>) -> Void) {
        let entry = SpendingPaceEntry(date: .now, data: WidgetDataManager.read())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - Widget Bundle

@main
struct HappyTuskWidgetBundle: WidgetBundle {
    var body: some Widget {
        SpendingPaceWidget()
        LatestTransactionsWidget()
    }
}

// MARK: - Widget Configuration

struct SpendingPaceWidget: Widget {
    let kind = "SpendingPaceWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SpendingPaceProvider()) { entry in
            SpendingPaceWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://insights"))
        }
        .configurationDisplayName("Spending Pace")
        .description("Track your monthly spending against your budget.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Preview Data

extension SpendingPaceData {
    static let preview: SpendingPaceData = {
        let cumulative: [Decimal] = [
            120, 250, 410, 530, 690, 810, 960,
            1100, 1230, 1380, 1500, 1620, 1750, 1880,
            2010, 2150, 2280, 2400, 2530, 2660, 2790,
            2920, 3050, 3180, 3253, 0, 0, 0
        ]
        return SpendingPaceData(
            monthLabel: "Feb 2026",
            daysInMonth: 28,
            totalBudgeted: 4500,
            totalSpent: 3253,
            dailyCumulative: cumulative,
            lastUpdated: .now
        )
    }()
}
