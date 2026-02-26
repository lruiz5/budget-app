import SwiftUI
import WidgetKit

struct CategoryRingsWidgetEntryView: View {
    let entry: CategoryRingsEntry

    var body: some View {
        if let data = entry.data {
            VStack(spacing: 6) {
                // Header
                HStack(spacing: 0) {
                    if isStale(data) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                            .padding(.trailing, 4)
                    }

                    
                }

                // 4 priority rings
                HStack(spacing: 12) {
                    ForEach(data.priorityRings, id: \.categoryType) { ring in
                        CategoryRingView(ring: ring)
                    }
                }
                .frame(maxHeight: .infinity)
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 2)
        } else {
            VStack(spacing: 8) {
                Image(systemName: "circle.dotted")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Open Happy Tusk\nto load data")
                    .font(.custom("Outfit", size: 13))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func isStale(_ data: CategoryRingsData) -> Bool {
        Date().timeIntervalSince(data.lastUpdated) > 86400
    }
}

// MARK: - Single Category Ring

struct CategoryRingView: View {
    let ring: CategoryRingItem
    var size: CGFloat = 44
    var strokeWidth: CGFloat = 4.5

    private static let currencyWhole: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        f.maximumFractionDigits = 0
        return f
    }()

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                // Background track
                Circle()
                    .stroke(Color(.systemGray5), lineWidth: strokeWidth)

                // Progress arc
                Circle()
                    .trim(from: 0, to: ring.progress)
                    .stroke(
                        ring.isOver ? Color.red : Color.green,
                        style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))

                // Emoji
                Text(ring.emoji)
                    .font(.system(size: size * 0.41))
                    .padding(6)
            }
            .frame(width: size, height: size)
            .padding(.bottom, 10)

            // Dollar remaining
            Text(formatCompact(ring))
                .font(.custom("Outfit", size: 14))
                .fontWeight(.medium)
                .foregroundStyle(ring.isOver ? Color.red : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            Text(ring.isOver ? "over" : "left")
                .font(.custom("Outfit", size: 11))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func formatCompact(_ ring: CategoryRingItem) -> String {
        if ring.isOver {
            let overAmount = Double(truncating: (ring.actual - ring.planned) as NSNumber)
            if overAmount >= 1000 {
                return "-$\(String(format: "%.1f", overAmount / 1000))k"
            }
            return "-\(Self.currencyWhole.string(from: NSNumber(value: overAmount)) ?? "$0")"
        }
        let num = Double(truncating: ring.remaining as NSNumber)
        if num >= 1000 {
            return "$\(String(format: "%.1f", num / 1000))k"
        }
        return Self.currencyWhole.string(from: NSNumber(value: num)) ?? "$0"
    }
}

// MARK: - Previews

#Preview(as: .systemMedium) {
    CategoryRingsWidget()
} timeline: {
    CategoryRingsEntry(date: .now, data: .preview)
    CategoryRingsEntry(date: .now, data: nil)
}
