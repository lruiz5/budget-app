import Foundation

/// Lightweight data model for the Spending Pace widget.
/// Written by the main app, read by the widget extension.
struct SpendingPaceData: Codable {
    let monthLabel: String          // e.g. "Feb 2026"
    let daysInMonth: Int            // 28-31
    let totalBudgeted: Decimal      // total expense planned
    let totalSpent: Decimal         // cumulative spending to date
    let dailyCumulative: [Decimal]  // index 0 = day 1, count = daysInMonth
    let lastUpdated: Date

    var remaining: Decimal {
        max(totalBudgeted - totalSpent, 0)
    }

    var spendingRatio: Double {
        guard totalBudgeted > 0 else { return 0 }
        return Double(truncating: (totalSpent / totalBudgeted) as NSNumber)
    }
}
