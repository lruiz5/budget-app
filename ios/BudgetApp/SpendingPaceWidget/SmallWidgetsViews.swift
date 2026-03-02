import SwiftUI
import WidgetKit
import AppIntents

// MARK: - Shared Helpers

private let compactCurrencyFormatter: NumberFormatter = {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.currencyCode = "USD"
    f.maximumFractionDigits = 0
    return f
}()

private func formatCompact(_ amount: Decimal, isOver: Bool = false) -> String {
    let num = abs(Double(truncating: amount as NSNumber))
    let formatted: String
    if num >= 1000 {
        formatted = "$\(String(format: "%.1f", num / 1000))k"
    } else {
        formatted = compactCurrencyFormatter.string(from: NSNumber(value: num)) ?? "$0"
    }
    return isOver ? "-\(formatted)" : formatted
}

private func isStale(_ date: Date) -> Bool {
    Date().timeIntervalSince(date) > 86400
}

// MARK: - ═══════════════════════════════════════════
// MARK: Widget 1: Spending Pace Small
// MARK: - ═══════════════════════════════════════════

struct SpendingPaceSmallProvider: TimelineProvider {
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

struct SpendingPaceSmallWidget: Widget {
    let kind = "SpendingPaceSmallWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SpendingPaceSmallProvider()) { entry in
            SpendingPaceSmallEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://insights"))
        }
        .configurationDisplayName("Spending Pace")
        .description("Your remaining budget at a glance.")
        .supportedFamilies([.systemSmall])
    }
}

struct SpendingPaceSmallEntryView: View {
    let entry: SpendingPaceEntry

    var body: some View {
        if let data = entry.data {
            VStack(spacing: 4) {
                // Month label + stale icon
                HStack(spacing: 4) {
                    Text(data.monthLabel)
                        .font(.custom("Outfit", size: 10))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    if isStale(data.lastUpdated) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 8))
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                // Progress arc with remaining amount
                SpendingPaceArcView(data: data)

                Spacer()

                // Budget total
                Text("of \(formatCompact(data.totalBudgeted)) budgeted")
                    .font(.custom("Outfit", size: 10))
                    .foregroundStyle(.tertiary)
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Open Happy Tusk\nto load data")
                    .font(.custom("Outfit", size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

private struct SpendingPaceArcView: View {
    let data: SpendingPaceData

    private var ratio: Double { data.spendingRatio }

    private var arcColor: Color {
        if ratio < 0.5 { return .green }
        if ratio < 0.8 { return .yellow }
        if ratio < 1.0 { return .orange }
        return .red
    }

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color(.systemGray5), lineWidth: 7)

            Circle()
                .trim(from: 0, to: CGFloat(min(ratio, 1.0)))
                .stroke(arcColor, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                .rotationEffect(.degrees(-90))

            VStack(spacing: 1) {
                Text(formatCompact(data.remaining))
                    .font(.custom("Outfit", size: 20))
                    .fontWeight(.bold)
                    .foregroundStyle(ratio > 1.0 ? Color.red : .primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("remaining")
                    .font(.custom("Outfit", size: 9))
                    .foregroundStyle(.secondary)
            }
        }
        .frame(width: 100, height: 100)
    }
}

// MARK: - ═══════════════════════════════════════════
// MARK: Widget 2: Single Category Ring (Configurable)
// MARK: - ═══════════════════════════════════════════

// MARK: AppIntent — Category Picker

struct CategoryEntity: AppEntity {
    let id: String
    let displayName: String
    let emoji: String

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Category")

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(emoji) \(displayName)")
    }

    static var defaultQuery = CategoryEntityQuery()
}

struct CategoryEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CategoryEntity] {
        allCategories().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [CategoryEntity] {
        allCategories()
    }

    func defaultResult() async -> CategoryEntity? {
        allCategories().first { $0.id == "food" } ?? allCategories().first
    }

    private func allCategories() -> [CategoryEntity] {
        guard let data = WidgetDataManager.readCategoryRings() else {
            return [
                CategoryEntity(id: "household", displayName: "Household", emoji: "🏠"),
                CategoryEntity(id: "transportation", displayName: "Transportation", emoji: "🚗"),
                CategoryEntity(id: "food", displayName: "Food", emoji: "🍽️"),
                CategoryEntity(id: "personal", displayName: "Personal", emoji: "👤"),
            ]
        }
        return data.rings.map { ring in
            CategoryEntity(id: ring.categoryType, displayName: ring.name, emoji: ring.emoji)
        }
    }
}

struct CategorySelectionIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Choose Category"
    static let description = IntentDescription("Select a spending category to track.")

    @Parameter(title: "Category")
    var category: CategoryEntity?
}

// MARK: Provider

struct SingleCategoryRingEntry: TimelineEntry {
    let date: Date
    let ring: CategoryRingItem?
    let monthLabel: String
    var lastUpdated: Date = .now
}

struct SingleCategoryRingProvider: AppIntentTimelineProvider {
    typealias Entry = SingleCategoryRingEntry
    typealias Intent = CategorySelectionIntent

    func placeholder(in context: Context) -> SingleCategoryRingEntry {
        SingleCategoryRingEntry(
            date: .now,
            ring: CategoryRingItem(categoryType: "food", name: "Food", emoji: "🍽️", planned: 600, actual: 430),
            monthLabel: "Feb 2026"
        )
    }

    func snapshot(for configuration: CategorySelectionIntent, in context: Context) async -> SingleCategoryRingEntry {
        if context.isPreview {
            return placeholder(in: context)
        }
        return makeEntry(for: configuration)
    }

    func timeline(for configuration: CategorySelectionIntent, in context: Context) async -> Timeline<SingleCategoryRingEntry> {
        let entry = makeEntry(for: configuration)
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        return Timeline(entries: [entry], policy: .after(nextRefresh))
    }

    private func makeEntry(for configuration: CategorySelectionIntent) -> SingleCategoryRingEntry {
        guard let data = WidgetDataManager.readCategoryRings() else {
            return SingleCategoryRingEntry(date: .now, ring: nil, monthLabel: "")
        }
        let targetType = configuration.category?.id ?? "food"
        let ring = data.rings.first { $0.categoryType == targetType } ?? data.rings.first
        return SingleCategoryRingEntry(date: .now, ring: ring, monthLabel: data.monthLabel, lastUpdated: data.lastUpdated)
    }
}

// MARK: Widget Configuration

struct SingleCategoryRingSmallWidget: Widget {
    let kind = "SingleCategoryRingSmallWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: CategorySelectionIntent.self, provider: SingleCategoryRingProvider()) { entry in
            SingleCategoryRingSmallEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://budget"))
        }
        .configurationDisplayName("Category Ring")
        .description("Track spending for a single category.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: View

struct SingleCategoryRingSmallEntryView: View {
    let entry: SingleCategoryRingEntry

    var body: some View {
        if let ring = entry.ring {
            VStack(spacing: 4) {
                // Month label + stale icon
                HStack(spacing: 4) {
                    Text(entry.monthLabel)
                        .font(.custom("Outfit", size: 10))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    if isStale(entry.lastUpdated) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 8))
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                // Large category ring
                ZStack {
                    Circle()
                        .stroke(Color(.systemGray5), lineWidth: 7)

                    Circle()
                        .trim(from: 0, to: ring.progress)
                        .stroke(
                            ring.isOver ? Color.red : Color.green,
                            style: StrokeStyle(lineWidth: 7, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 1) {
                        Text(ring.emoji)
                            .font(.system(size: 28))
                    }
                }
                .frame(width: 90, height: 90)

                Spacer()

                // Category name + remaining
                VStack(spacing: 1) {
                    Text(ring.name)
                        .font(.custom("Outfit", size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    HStack(spacing: 3) {
                        Text(ring.isOver
                            ? formatCompact(ring.actual - ring.planned, isOver: true)
                            : formatCompact(ring.remaining))
                            .font(.custom("Outfit", size: 14))
                            .fontWeight(.semibold)
                            .foregroundStyle(ring.isOver ? Color.red : .primary)

                        Text(ring.isOver ? "over" : "left")
                            .font(.custom("Outfit", size: 11))
                            .foregroundStyle(.secondary)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                }
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "circle.dotted")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Open Happy Tusk\nto load data")
                    .font(.custom("Outfit", size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - ═══════════════════════════════════════════
// MARK: Widget 3: Budget Overview (Nested Rings)
// MARK: - ═══════════════════════════════════════════

struct BudgetOverviewEntry: TimelineEntry {
    let date: Date
    let data: BudgetOverviewData?
}

struct BudgetOverviewProvider: TimelineProvider {
    func placeholder(in context: Context) -> BudgetOverviewEntry {
        BudgetOverviewEntry(date: .now, data: .preview)
    }

    func getSnapshot(in context: Context, completion: @escaping (BudgetOverviewEntry) -> Void) {
        if context.isPreview {
            completion(BudgetOverviewEntry(date: .now, data: .preview))
        } else {
            completion(BudgetOverviewEntry(date: .now, data: WidgetDataManager.readBudgetOverview()))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgetOverviewEntry>) -> Void) {
        let entry = BudgetOverviewEntry(date: .now, data: WidgetDataManager.readBudgetOverview())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}

struct BudgetOverviewSmallWidget: Widget {
    let kind = "BudgetOverviewSmallWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BudgetOverviewProvider()) { entry in
            BudgetOverviewSmallEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://budget"))
        }
        .configurationDisplayName("Budget Overview")
        .description("Income vs expenses at a glance.")
        .supportedFamilies([.systemSmall])
    }
}

struct BudgetOverviewSmallEntryView: View {
    let entry: BudgetOverviewEntry

    var body: some View {
        if let data = entry.data {
            VStack(spacing: 4) {
                // Month label + stale icon
                HStack(spacing: 4) {
                    Text(data.monthLabel)
                        .font(.custom("Outfit", size: 10))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    if isStale(data.lastUpdated) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 8))
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                // Nested rings
                NestedBudgetRingsView(data: data)

                Spacer()

                // Legend
                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Circle().fill(data.isIncomeOver ? Color.red : Color.green)
                            .frame(width: 6, height: 6)
                        Text("Income")
                            .font(.custom("Outfit", size: 10))
                            .foregroundStyle(.secondary)
                    }
                    HStack(spacing: 4) {
                        Circle().fill(data.isExpenseOver ? Color.red : Color.orange)
                            .frame(width: 6, height: 6)
                        Text("Expenses")
                            .font(.custom("Outfit", size: 10))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "circle.dotted")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Open Happy Tusk\nto load data")
                    .font(.custom("Outfit", size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

private struct NestedBudgetRingsView: View {
    let data: BudgetOverviewData

    var body: some View {
        ZStack {
            // Outer ring — Income
            Circle()
                .stroke(Color(.systemGray5), lineWidth: 6)
                .frame(width: 100, height: 100)

            Circle()
                .trim(from: 0, to: CGFloat(data.incomeProgress))
                .stroke(
                    data.isIncomeOver ? Color.red : Color.green,
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .frame(width: 100, height: 100)

            // Inner ring — Expenses
            Circle()
                .stroke(Color(.systemGray5), lineWidth: 6)
                .frame(width: 72, height: 72)

            Circle()
                .trim(from: 0, to: CGFloat(data.expenseProgress))
                .stroke(
                    data.isExpenseOver ? Color.red : Color.orange,
                    style: StrokeStyle(lineWidth: 6, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .frame(width: 72, height: 72)

            // Center text
            VStack(spacing: 1) {
                Text(formatCompact(
                    data.isExpenseOver ? (data.expenseActual - data.expensePlanned) : data.expenseRemaining,
                    isOver: data.isExpenseOver
                ))
                    .font(.custom("Outfit", size: 14))
                    .fontWeight(.bold)
                    .foregroundStyle(data.isExpenseOver ? Color.red : .primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(data.isExpenseOver ? "over" : "exp left")
                    .font(.custom("Outfit", size: 9))
                    .foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - ═══════════════════════════════════════════
// MARK: Widget 4: Budget Item Ring (Configurable)
// MARK: - ═══════════════════════════════════════════

// MARK: AppIntent — Budget Item Picker

struct BudgetItemEntity: AppEntity {
    let id: String          // budget item ID as string
    let displayName: String // "Personal Spending Money"
    let categoryEmoji: String

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Budget Item")

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(categoryEmoji) \(displayName)")
    }

    static var defaultQuery = BudgetItemEntityQuery()
}

struct BudgetItemEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [BudgetItemEntity] {
        allItems().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [BudgetItemEntity] {
        allItems()
    }

    func defaultResult() async -> BudgetItemEntity? {
        allItems().first
    }

    private func allItems() -> [BudgetItemEntity] {
        guard let data = WidgetDataManager.readBudgetItemRings() else {
            return [
                BudgetItemEntity(id: "0", displayName: "Spending Money", categoryEmoji: "👤"),
            ]
        }
        return data.items.map { item in
            BudgetItemEntity(id: String(item.id), displayName: item.name, categoryEmoji: item.categoryEmoji)
        }
    }
}

struct BudgetItemSelectionIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Choose Budget Item"
    static let description = IntentDescription("Select a budget line item to track.")

    @Parameter(title: "Budget Item")
    var budgetItem: BudgetItemEntity?
}

// MARK: Provider

struct BudgetItemRingEntry: TimelineEntry {
    let date: Date
    let item: BudgetItemRingItem?
    let monthLabel: String
    var lastUpdated: Date = .now
}

struct BudgetItemRingProvider: AppIntentTimelineProvider {
    typealias Entry = BudgetItemRingEntry
    typealias Intent = BudgetItemSelectionIntent

    func placeholder(in context: Context) -> BudgetItemRingEntry {
        BudgetItemRingEntry(
            date: .now,
            item: BudgetItemRingItem(id: 0, name: "Spending Money", categoryName: "Personal", categoryEmoji: "👤", planned: 200, actual: 135),
            monthLabel: "Mar 2026"
        )
    }

    func snapshot(for configuration: BudgetItemSelectionIntent, in context: Context) async -> BudgetItemRingEntry {
        if context.isPreview {
            return placeholder(in: context)
        }
        return makeEntry(for: configuration)
    }

    func timeline(for configuration: BudgetItemSelectionIntent, in context: Context) async -> Timeline<BudgetItemRingEntry> {
        let entry = makeEntry(for: configuration)
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now
        return Timeline(entries: [entry], policy: .after(nextRefresh))
    }

    private func makeEntry(for configuration: BudgetItemSelectionIntent) -> BudgetItemRingEntry {
        guard let data = WidgetDataManager.readBudgetItemRings() else {
            return BudgetItemRingEntry(date: .now, item: nil, monthLabel: "")
        }
        let targetId = configuration.budgetItem?.id
        let item: BudgetItemRingItem?
        if let targetId, let id = Int(targetId) {
            item = data.items.first { $0.id == id } ?? data.items.first
        } else {
            item = data.items.first
        }
        return BudgetItemRingEntry(date: .now, item: item, monthLabel: data.monthLabel, lastUpdated: data.lastUpdated)
    }
}

// MARK: Widget Configuration

struct BudgetItemRingSmallWidget: Widget {
    let kind = "BudgetItemRingSmallWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: BudgetItemSelectionIntent.self, provider: BudgetItemRingProvider()) { entry in
            BudgetItemRingSmallEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
                .widgetURL(URL(string: "happytusk://budget"))
        }
        .configurationDisplayName("Budget Item")
        .description("Track spending for a single budget line item.")
        .supportedFamilies([.systemSmall])
    }
}

// MARK: View

struct BudgetItemRingSmallEntryView: View {
    let entry: BudgetItemRingEntry

    var body: some View {
        if let item = entry.item {
            VStack(spacing: 4) {
                // Month label + stale icon
                HStack(spacing: 4) {
                    Text(entry.monthLabel)
                        .font(.custom("Outfit", size: 10))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    if isStale(entry.lastUpdated) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 8))
                            .foregroundStyle(.tertiary)
                    }
                }

                Spacer()

                // Progress ring with emoji
                ZStack {
                    Circle()
                        .stroke(Color(.systemGray5), lineWidth: 7)

                    Circle()
                        .trim(from: 0, to: CGFloat(item.progress))
                        .stroke(
                            item.isOver ? Color.red : Color.green,
                            style: StrokeStyle(lineWidth: 7, lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))

                    VStack(spacing: 1) {
                        Text(item.categoryEmoji)
                            .font(.system(size: 28))
                    }
                }
                .frame(width: 90, height: 90)

                Spacer()

                // Item name + remaining
                VStack(spacing: 1) {
                    Text(item.name)
                        .font(.custom("Outfit", size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    HStack(spacing: 3) {
                        Text(item.isOver
                            ? formatCompact(item.actual - item.planned, isOver: true)
                            : formatCompact(item.remaining))
                            .font(.custom("Outfit", size: 14))
                            .fontWeight(.semibold)
                            .foregroundStyle(item.isOver ? Color.red : .primary)

                        Text(item.isOver ? "over" : "left")
                            .font(.custom("Outfit", size: 11))
                            .foregroundStyle(.secondary)
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                }
            }
        } else {
            VStack(spacing: 8) {
                Image(systemName: "circle.dotted")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Open Happy Tusk\nto load data")
                    .font(.custom("Outfit", size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }
}

// MARK: - Preview Data

extension BudgetOverviewData {
    static let preview = BudgetOverviewData(
        monthLabel: "Feb 2026",
        incomePlanned: 5000,
        incomeActual: 4800,
        expensePlanned: 4500,
        expenseActual: 3253,
        lastUpdated: .now
    )
}

// MARK: - Previews

#Preview("Spending Pace Small", as: .systemSmall) {
    SpendingPaceSmallWidget()
} timeline: {
    SpendingPaceEntry(date: .now, data: .preview)
    SpendingPaceEntry(date: .now, data: nil)
}

#Preview("Category Ring Small", as: .systemSmall) {
    SingleCategoryRingSmallWidget()
} timeline: {
    SingleCategoryRingEntry(
        date: .now,
        ring: CategoryRingItem(categoryType: "food", name: "Food", emoji: "🍽️", planned: 600, actual: 430),
        monthLabel: "Feb 2026"
    )
    SingleCategoryRingEntry(date: .now, ring: nil, monthLabel: "")
}

#Preview("Budget Overview Small", as: .systemSmall) {
    BudgetOverviewSmallWidget()
} timeline: {
    BudgetOverviewEntry(date: .now, data: .preview)
    BudgetOverviewEntry(date: .now, data: nil)
}

#Preview("Budget Item Ring Small", as: .systemSmall) {
    BudgetItemRingSmallWidget()
} timeline: {
    BudgetItemRingEntry(
        date: .now,
        item: BudgetItemRingItem(id: 1, name: "Spending Money", categoryName: "Personal", categoryEmoji: "👤", planned: 200, actual: 135),
        monthLabel: "Mar 2026"
    )
    BudgetItemRingEntry(date: .now, item: nil, monthLabel: "")
}
