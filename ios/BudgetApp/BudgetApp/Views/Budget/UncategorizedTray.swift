import SwiftUI

struct FloatingTransactionPill: View {
    let transactions: [Transaction]
    @Binding var isExpanded: Bool
    var onChipTap: ((Transaction) -> Void)?

    var body: some View {
        HStack(spacing: 8) {
            if isExpanded {
                // Fanned-out horizontal chip row
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(transactions) { txn in
                            TransactionChip(transaction: txn)
                                .onTapGesture {
                                    onChipTap?(txn)
                                }
                                .onDrag {
                                    NSItemProvider(object: "txn:\(txn.id)" as NSString)
                                }
                        }
                    }
                    .padding(.leading, 8)
                    .padding(.trailing, 4)
                    .padding(.vertical, 16)
                }

                // Collapse button
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        isExpanded = false
                    }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.outfitTitle3)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .padding(.trailing, 12)
            } else {
                // Collapsed badge pill
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        isExpanded = true
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "tray.full.fill")
                            .font(.outfitCaption)
                        Text("\(transactions.count)")
                            .font(.outfitSubheadline)
                            .fontWeight(.semibold)
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color.orange)
                    .clipShape(Capsule())
                    .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxHeight: 64)
        .transition(.scale.combined(with: .opacity))
    }
}

// MARK: - Transaction Chip

private struct TransactionChip: View {
    let transaction: Transaction

    var body: some View {
        HStack(spacing: 6) {
            Text({
                    let name = transaction.merchant ?? String(transaction.description.prefix(12))
                    return name.count > 6 ? String(name.prefix(6)) + "..." : name
                }())
                .font(.outfitCaption)
                .fontWeight(.medium)
                .lineLimit(1)
            Text(transaction.displayAmount)
                .font(.outfitCaption)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color(.systemBackground))
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
        .contentShape(Capsule())
    }
}
