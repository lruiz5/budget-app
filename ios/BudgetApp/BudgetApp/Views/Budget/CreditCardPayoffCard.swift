import SwiftUI

// MARK: - Credit Card Payoff Card
// iOS counterpart of web `components/CreditCardPanel.tsx`. Collapsed it shows
// what's left to pay off this month; expanded it breaks that into charges and
// payments, each with its own transaction list.

struct CreditCardPayoffCard: View {
    let card: CreditCardSummary
    /// The live balance is "now", so it only checks the current month
    let isCurrentMonth: Bool

    @State private var isExpanded = false
    @State private var expandedList: ActivityList?

    private enum ActivityList { case charges, payments }

    var body: some View {
        VStack(spacing: 0) {
            header

            if isExpanded {
                VStack(spacing: 6) {
                    if abs(card.opening) > Decimal(string: "0.005")! {
                        row("Opening balance", formatCurrency(card.opening))
                    }
                    activityRow("Charged", formatCurrency(card.charges), list: .charges, items: card.chargeList)
                    if card.refunds > 0 {
                        row("Refunds", "-" + formatCurrency(card.refunds))
                    }
                    activityRow("Paid", "-" + formatCurrency(card.payments), list: .payments, items: card.paymentList)

                    if hasFootnote {
                        footnote
                            .font(.outfitCaption)
                            .frame(maxWidth: .infinity, alignment: .trailing)
                            .padding(.top, 4)
                    }
                }
                .padding(.top, 10)
                .transition(.opacity)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .cardStyle()
    }

    // MARK: - Header

    private var header: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                isExpanded.toggle()
            }
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "creditcard.fill")
                    .font(.outfitSubheadline)
                    .foregroundStyle(Color.appPrimary)

                VStack(alignment: .leading, spacing: 2) {
                    Text(card.accountName)
                        .font(.outfitSubheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(Color.appTextPrimary)
                    Text(card.isPaidOff ? "Paid off" : "Left to pay off")
                        .font(.outfitCaption)
                        .foregroundStyle(card.isPaidOff ? Color.appSuccess : Color.appTextSecondary)
                }

                Spacer()

                HStack(spacing: 6) {
                    if card.isPaidOff {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(Color.appSuccess)
                    }
                    Text(outstandingText)
                        .font(.outfitTitle3)
                        .fontWeight(.semibold)
                        .foregroundStyle(card.isPaidOff ? Color.appSuccess : Color.appTextPrimary)
                }

                Image(systemName: "chevron.down")
                    .font(.outfitCaption)
                    .foregroundStyle(Color.appTextTertiary)
                    .rotationEffect(.degrees(isExpanded ? 180 : 0))
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var outstandingText: String {
        if card.outstanding < Decimal(string: "-0.005")! {
            return "\(formatCurrency(-card.outstanding)) credit"
        }
        return formatCurrency(max(card.outstanding, 0))
    }

    // MARK: - Rows

    private func row(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
                .font(.outfitSubheadline)
                .foregroundStyle(Color.appTextSecondary)
            Spacer()
            Text(value)
                .font(.outfitSubheadline)
                .fontWeight(.semibold)
                .foregroundStyle(Color.appTextPrimary)
        }
    }

    @ViewBuilder
    private func activityRow(_ label: String, _ value: String, list: ActivityList, items: [CreditCardActivity]) -> some View {
        let isOpen = expandedList == list
        Button {
            withAnimation(.easeInOut(duration: 0.2)) {
                expandedList = isOpen ? nil : list
            }
        } label: {
            HStack {
                HStack(spacing: 4) {
                    Text(label)
                    if !items.isEmpty {
                        Image(systemName: "chevron.down")
                            .font(.outfitCaption2)
                            .rotationEffect(.degrees(isOpen ? 180 : 0))
                    }
                }
                .font(.outfitSubheadline)
                .foregroundStyle(Color.appTextSecondary)
                Spacer()
                Text(value)
                    .font(.outfitSubheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.appTextPrimary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(items.isEmpty)

        if isOpen {
            VStack(spacing: 4) {
                ForEach(items) { item in
                    activityItem(item, isPayment: list == .payments)
                }
            }
            .padding(.leading, 12)
            .padding(.bottom, 4)
        }
    }

    private func activityItem(_ item: CreditCardActivity, isPayment: Bool) -> some View {
        HStack(spacing: 8) {
            Group {
                if isPayment {
                    let note = Text(item.paired == false ? " · no checking match" : "").foregroundStyle(Color.appTextTertiary)
                    Text("\(item.displayDate)\(note)")
                } else {
                    let note = Text(item.isPending ? " · pending" : "").foregroundStyle(Color.appTextTertiary)
                    Text("\(item.displayDate) · \(item.merchant ?? "Card purchase")\(note)")
                }
            }
            .lineLimit(1)
            Spacer(minLength: 8)
            Text(formatCurrency(item.amount))
        }
        .font(.outfitCaption)
        .foregroundStyle(Color.appTextSecondary)
    }

    // MARK: - Footnote

    private var showsBankCheck: Bool { isCurrentMonth && card.liveOwed != nil }

    private var hasFootnote: Bool { card.pendingCharges > 0 || showsBankCheck }

    private var footnote: some View {
        HStack(spacing: 0) {
            if card.pendingCharges > 0 {
                Text("Includes \(formatCurrency(card.pendingCharges)) pending")
                    .foregroundStyle(Color.appTextTertiary)
            }
            if card.pendingCharges > 0 && showsBankCheck {
                Text(" · ").foregroundStyle(Color.appTextTertiary)
            }
            if showsBankCheck, let liveOwed = card.liveOwed {
                if card.matchesBank {
                    Text("Matches bank balance").foregroundStyle(Color.appSuccess)
                } else {
                    Text("Bank shows \(formatCurrency(liveOwed)) owed").foregroundStyle(Color.appTextTertiary)
                }
            }
        }
    }

    private func formatCurrency(_ value: Decimal) -> String {
        Formatters.currency.string(from: value as NSNumber) ?? "$0.00"
    }
}
