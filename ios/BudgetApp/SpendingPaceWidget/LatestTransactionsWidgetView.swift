import SwiftUI
import WidgetKit

struct LatestTransactionsWidgetEntryView: View {
    let entry: LatestTransactionsEntry

    var body: some View {
        if let data = entry.data, !data.transactions.isEmpty {
            VStack(alignment: .leading, spacing: 0) {
                // Title
                HStack(spacing: 0) {
                    if isStale(data) {
                        Image(systemName: "arrow.trianglehead.clockwise")
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                            .padding(.trailing, 4)
                    }

                    Text("Latest Transactions")
                        .font(.custom("Outfit", size: 13))
                        .fontWeight(.semibold)
                        .foregroundStyle(.secondary)

                    Spacer()

                    Text(timeAgoLabel(data.lastUpdated))
                        .font(.custom("Outfit", size: 10))
                        .foregroundStyle(.tertiary)
                }
                .padding(.bottom, 6)

                // Transaction rows
                ForEach(data.transactions.prefix(4)) { transaction in
                    TransactionRowView(transaction: transaction)
                    if transaction.id != data.transactions.prefix(4).last?.id {
                        Divider()
                            .padding(.vertical, 2)
                    }
                }

                Spacer(minLength: 0)
            }
            .padding(.horizontal, 2)
            .padding(.vertical, 2)
        } else {
            // Empty state — no uncategorized transactions is a good thing
            VStack(spacing: 8) {
                Image(systemName: "checkmark.circle")
                    .font(.title2)
                    .foregroundStyle(.green)
                Text("All caught up!")
                    .font(.custom("Outfit", size: 14))
                    .fontWeight(.medium)
                Text("No uncategorized\ntransactions")
                    .font(.custom("Outfit", size: 12))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    private func isStale(_ data: LatestTransactionsData) -> Bool {
        Date().timeIntervalSince(data.lastUpdated) > 86400
    }

    private func timeAgoLabel(_ date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "updated just now" }
        let minutes = seconds / 60
        if minutes < 60 { return "updated \(minutes)m ago" }
        let hours = minutes / 60
        if hours < 24 { return "updated \(hours)h ago" }
        let days = hours / 24
        return "updated \(days)d ago"
    }
}

// MARK: - Transaction Row

struct TransactionRowView: View {
    let transaction: WidgetTransaction

    private static let currencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "USD"
        return f
    }()

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text(transaction.description)
                    .font(.custom("Outfit", size: 13))
                    .fontWeight(.medium)
                    .lineLimit(1)

                Text(transaction.date)
                    .font(.custom("Outfit", size: 10))
                    .foregroundStyle(.tertiary)
            }

            Spacer(minLength: 4)

            Text(formattedAmount)
                .font(.custom("Outfit", size: 13))
                .fontWeight(.semibold)
                .foregroundStyle(transaction.type == "income" ? Color.green : .primary)
        }
    }

    private var formattedAmount: String {
        let formatted = Self.currencyFormatter.string(from: transaction.amount as NSNumber) ?? "$0.00"
        if transaction.type == "income" {
            return "+\(formatted)"
        }
        return "-\(formatted)"
    }
}

// MARK: - Previews

#Preview(as: .systemMedium) {
    LatestTransactionsWidget()
} timeline: {
    LatestTransactionsEntry(date: .now, data: .preview)
    LatestTransactionsEntry(date: .now, data: nil)
}
