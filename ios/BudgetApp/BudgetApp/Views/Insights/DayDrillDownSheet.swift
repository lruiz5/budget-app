import SwiftUI

struct DayDrillDownSheet: View {
    let date: Date
    let transactions: [Transaction]
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    // Total spending header
                    VStack(spacing: 4) {
                        Text("Total Spent")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(formatCurrency(totalAmount))
                            .font(.title)
                            .fontWeight(.bold)
                        Text("\(transactions.count) transaction\(transactions.count == 1 ? "" : "s")")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)

                    // Transactions list
                    VStack(spacing: 0) {
                        ForEach(transactions) { transaction in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(transaction.merchant ?? transaction.description)
                                        .font(.subheadline)
                                        .lineLimit(1)
                                    if transaction.merchant != nil && !transaction.description.isEmpty {
                                        Text(transaction.description)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                }

                                Spacer()

                                Text(formatCurrency(transaction.amount))
                                    .font(.subheadline)
                                    .fontWeight(.medium)
                            }
                            .padding(.vertical, 8)

                            if transaction.id != transactions.last?.id {
                                Divider()
                            }
                        }
                    }
                    .padding()
                    .background(Color(.systemGray6))
                    .cornerRadius(12)
                }
                .padding()
            }
            .navigationTitle(formattedDate)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private var totalAmount: Decimal {
        transactions.reduce(0) { $0 + $1.amount }
    }

    private var formattedDate: String {
        Formatters.dateLongUTC.string(from: date)
    }

    private func formatCurrency(_ value: Decimal) -> String {
        Formatters.currency.string(from: value as NSNumber) ?? "$0.00"
    }
}
