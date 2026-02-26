import SwiftUI
import WidgetKit

struct SpendingPaceWidgetEntryView: View {
    let entry: SpendingPaceEntry

    private static let currencyWhole: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = 0
        return f
    }()

    var body: some View {
        if let data = entry.data {
            VStack(spacing: 4) {
                // Title: remaining + budgeted centered at top
                HStack(spacing: 0) {
                    if isStale(data) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                            .padding(.trailing, 4)
                    }

                    Text(Self.currencyWhole.string(from: data.remaining as NSNumber) ?? "$0")
                        .font(.custom("Outfit", size: 17))
                        .fontWeight(.bold)
                        .foregroundStyle(data.spendingRatio > 1.0 ? Color.red : .primary)

                    Text(" remaining")
                        .font(.custom("Outfit", size: 13))
                        .foregroundStyle(.secondary)
                }

                Text("out of \(Self.currencyWhole.string(from: data.totalBudgeted as NSNumber) ?? "$0") budgeted")
                    .font(.custom("Outfit", size: 11))
                    .foregroundStyle(.tertiary)

                // Spending pace chart
                SpendingPaceChartView(data: data)
                    .frame(maxHeight: .infinity)
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 2)
        } else {
            // Empty state
            VStack(spacing: 8) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Open Happy Tusk\nto load data")
                    .font(.custom("Outfit", size: 13))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func isStale(_ data: SpendingPaceData) -> Bool {
        Date().timeIntervalSince(data.lastUpdated) > 86400 // 24 hours
    }
}

// MARK: - Chart View

struct SpendingPaceChartView: View {
    let data: SpendingPaceData

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let height = geo.size.height
            let maxY = max(data.totalBudgeted, data.totalSpent, 1) // avoid division by zero
            let maxYDouble = Double(truncating: maxY as NSNumber)
            let days = max(data.daysInMonth, 1)

            ZStack {
                // Dashed pace line: $0 at day 1 -> totalBudgeted at last day
                Path { path in
                    path.move(to: CGPoint(x: 0, y: height))
                    let budgetY = height - (height * Double(truncating: data.totalBudgeted as NSNumber) / maxYDouble)
                    path.addLine(to: CGPoint(x: width, y: budgetY))
                }
                .stroke(Color.gray.opacity(0.35), style: StrokeStyle(lineWidth: 1.5, dash: [6, 4]))

                // Spending line with green-to-red gradient
                let points = data.dailyCumulative.enumerated().map { (i, cum) in
                    CGPoint(
                        x: width * CGFloat(i) / CGFloat(max(days - 1, 1)),
                        y: height - (height * CGFloat(truncating: cum as NSNumber) / CGFloat(maxYDouble))
                    )
                }

                if !points.isEmpty {
                    // Find last point with actual spending data
                    let lastDataIndex = lastNonZeroIndex(in: data.dailyCumulative)

                    Path { path in
                        path.move(to: points[0])
                        for i in 1...lastDataIndex {
                            path.addLine(to: points[i])
                        }
                    }
                    .stroke(
                        spendingGradient,
                        style: StrokeStyle(lineWidth: 2.5, lineJoin: .round)
                    )

                    // Pulsing dot at the end of the line
                    if lastDataIndex < points.count {
                        let dotPoint = points[lastDataIndex]
                        Circle()
                            .fill(dotColor)
                            .frame(width: 6, height: 6)
                            .shadow(color: dotColor.opacity(0.5), radius: 3)
                            .position(dotPoint)
                    }
                }
            }
        }
    }

    private func lastNonZeroIndex(in values: [Decimal]) -> Int {
        for i in stride(from: values.count - 1, through: 0, by: -1) {
            if values[i] != 0 { return i }
        }
        return 0
    }

    private var dotColor: Color {
        let ratio = data.spendingRatio
        if ratio < 0.5 { return .green }
        if ratio < 0.8 { return .yellow }
        if ratio < 1.0 { return .orange }
        return .red
    }

    /// Dynamic gradient that stays green when under budget, shifts to red as spending approaches/exceeds budget
    private var spendingGradient: LinearGradient {
        let ratio = data.spendingRatio

        if ratio < 0.5 {
            // Well under budget — all green
            return LinearGradient(
                colors: [.green, .green],
                startPoint: .leading,
                endPoint: .trailing
            )
        } else if ratio < 0.8 {
            // Approaching — green to yellow
            return LinearGradient(
                stops: [
                    .init(color: .green, location: 0),
                    .init(color: .green, location: 0.6),
                    .init(color: .yellow, location: 1.0)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        } else if ratio < 1.0 {
            // Close to budget — green through yellow to orange
            return LinearGradient(
                stops: [
                    .init(color: .green, location: 0),
                    .init(color: .green, location: 0.3),
                    .init(color: .yellow, location: 0.6),
                    .init(color: .orange, location: 1.0)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        } else {
            // Over budget — green through orange to red
            return LinearGradient(
                stops: [
                    .init(color: .green, location: 0),
                    .init(color: .yellow, location: 0.4),
                    .init(color: .orange, location: 0.7),
                    .init(color: .red, location: 1.0)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
        }
    }
}

// MARK: - Previews

#Preview(as: .systemMedium) {
    SpendingPaceWidget()
} timeline: {
    SpendingPaceEntry(date: .now, data: .preview)
    SpendingPaceEntry(date: .now, data: nil)
}
