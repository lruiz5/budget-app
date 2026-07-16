import SwiftUI

// MARK: - Skeleton Primitive

/// Pulsing placeholder block — iOS counterpart of web `components/ui/Skeleton.tsx`.
/// Size it with `.frame()` at the call site. Loading states are skeleton layouts
/// shaped like the content, not spinners.
struct Skeleton: View {
    var cornerRadius: CGFloat = 6

    @State private var dimmed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius)
            .fill(Color.appBorder.opacity(0.7))
            .opacity(dimmed ? 0.45 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    dimmed = true
                }
            }
            .accessibilityHidden(true)
    }
}

// MARK: - Skeleton Rows

/// Two stacked text lines + trailing amount line — the shape of most list rows.
struct SkeletonListRow: View {
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 6) {
                Skeleton().frame(width: 140, height: 14)
                Skeleton().frame(width: 90, height: 11)
            }
            Spacer()
            Skeleton().frame(width: 64, height: 14)
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Screen Skeletons

/// Mirrors BudgetView's content: summary card + category cards with item rows.
struct BudgetSkeleton: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 12) {
                // Summary card
                VStack(alignment: .leading, spacing: 12) {
                    Skeleton().frame(width: 120, height: 16)
                    HStack {
                        Skeleton().frame(width: 90, height: 28)
                        Spacer()
                        Skeleton(cornerRadius: 22).frame(width: 44, height: 44)
                    }
                    Skeleton().frame(maxWidth: .infinity).frame(height: 12)
                }
                .padding(16)
                .cardStyle()

                // Category cards
                ForEach(0..<3, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Skeleton().frame(width: 130, height: 16)
                            Spacer()
                            Skeleton().frame(width: 70, height: 13)
                        }
                        .padding(.bottom, 8)

                        ForEach(0..<3, id: \.self) { _ in
                            SkeletonListRow()
                        }
                    }
                    .padding(16)
                    .cardStyle()
                }
            }
            .padding(16)
        }
        .scrollDisabled(true)
    }
}

/// Mirrors TransactionsView's list: date section headers + transaction rows.
struct TransactionListSkeleton: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(0..<3, id: \.self) { _ in
                    Skeleton().frame(width: 110, height: 12)
                        .padding(.top, 12)

                    VStack(spacing: 4) {
                        ForEach(0..<3, id: \.self) { _ in
                            SkeletonListRow()
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .cardStyle()
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollDisabled(true)
    }
}

/// Mirrors AccountsView's grouped list: institution headers + account rows.
struct AccountsListSkeleton: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(0..<2, id: \.self) { _ in
                    HStack(spacing: 8) {
                        Skeleton(cornerRadius: 12).frame(width: 24, height: 24)
                        Skeleton().frame(width: 100, height: 12)
                    }
                    .padding(.top, 12)

                    VStack(spacing: 4) {
                        ForEach(0..<2, id: \.self) { _ in
                            SkeletonListRow()
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .cardStyle()
                }
            }
            .padding(.horizontal, 16)
        }
        .scrollDisabled(true)
    }
}

/// Plain rows for pickers/sheets (e.g. category list while budget loads).
struct SheetListSkeleton: View {
    var rows: Int = 8

    var body: some View {
        ScrollView {
            VStack(spacing: 4) {
                ForEach(0..<rows, id: \.self) { _ in
                    SkeletonListRow()
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .cardStyle()
            .padding(16)
        }
        .scrollDisabled(true)
    }
}

#Preview("Budget") { BudgetSkeleton() }
#Preview("Transactions") { TransactionListSkeleton() }
#Preview("Accounts") { AccountsListSkeleton() }
