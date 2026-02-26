import WidgetKit
import SwiftUI

// MARK: - Timeline Entry

struct CategoryRingsEntry: TimelineEntry {
    let date: Date
    let data: CategoryRingsData?
}

// MARK: - Timeline Provider

struct CategoryRingsProvider: TimelineProvider {
    func placeholder(in context: Context) -> CategoryRingsEntry {
        CategoryRingsEntry(date: .now, data: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (CategoryRingsEntry) -> Void) {
        if context.isPreview {
            completion(CategoryRingsEntry(date: .now, data: .preview))
        } else {
            completion(CategoryRingsEntry(date: .now, data: WidgetDataManager.readCategoryRings()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CategoryRingsEntry>) -> Void) {
        let entry = CategoryRingsEntry(date: .now, data: WidgetDataManager.readCategoryRings())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

// MARK: - Widget Configuration

struct CategoryRingsWidget: Widget {
    let kind = "CategoryRingsWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CategoryRingsProvider()) { entry in
            CategoryRingsWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://budget"))
        }
        .configurationDisplayName("Category Rings")
        .description("Track spending progress for your top categories.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Preview Data

extension CategoryRingsData {
    static let preview = CategoryRingsData(
        rings: [
            CategoryRingItem(categoryType: "household", emoji: "🏠", planned: 1200, actual: 890),
            CategoryRingItem(categoryType: "transportation", emoji: "🚗", planned: 500, actual: 520),
            CategoryRingItem(categoryType: "food", emoji: "🍽️", planned: 600, actual: 430),
            CategoryRingItem(categoryType: "personal", emoji: "👤", planned: 300, actual: 150),
        ],
        monthLabel: "Feb 2026",
        lastUpdated: .now
    )
}
