import SwiftUI

// MARK: - Swipe Actions Row

struct SwipeRowAction: Identifiable {
    let id = UUID()
    let icon: String
    let tint: Color
    let action: () -> Void
}

/// Custom swipe-actions row for rows living inside `.cardStyle()` cards, where native
/// List `.swipeActions` aren't available. Drag mechanics mirror `SwipeToDeleteRow`
/// (offset reveal, single-open coordination via `activeSwipeItemId`), extended to
/// support multiple actions on both edges.
struct SwipeActionsRow<Content: View>: View {
    let itemId: Int
    @Binding var activeSwipeItemId: Int?
    var leadingActions: [SwipeRowAction] = []
    var trailingActions: [SwipeRowAction] = []
    @ViewBuilder let content: () -> Content

    private enum SwipeEdge { case leading, trailing }

    @State private var openEdge: SwipeEdge?
    @GestureState private var dragOffset: CGFloat = 0

    private let buttonWidth: CGFloat = 64
    private let snapThreshold: CGFloat = 40

    private var isOpen: Bool {
        activeSwipeItemId == itemId && openEdge != nil
    }

    private var leadingWidth: CGFloat { CGFloat(leadingActions.count) * buttonWidth }
    private var trailingWidth: CGFloat { CGFloat(trailingActions.count) * buttonWidth }

    private var currentOffset: CGFloat {
        let base: CGFloat
        if isOpen {
            base = openEdge == .trailing ? -trailingWidth : leadingWidth
        } else {
            base = 0
        }
        let raw = base + dragOffset
        return min(max(raw, -trailingWidth), leadingWidth)
    }

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                ForEach(leadingActions) { action in
                    actionButton(action)
                }
                Spacer(minLength: 0)
                ForEach(trailingActions) { action in
                    actionButton(action)
                }
            }

            content()
                .background(Color.appSurface)
                .offset(x: currentOffset)
                .gesture(
                    DragGesture(minimumDistance: 20, coordinateSpace: .local)
                        .updating($dragOffset) { value, state, _ in
                            // Only track horizontal drags (avoid eating vertical scroll)
                            if abs(value.translation.width) > abs(value.translation.height) {
                                state = value.translation.width
                            }
                        }
                        .onEnded { value in
                            guard abs(value.translation.width) > abs(value.translation.height) else { return }
                            let dx = value.translation.width
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                if isOpen {
                                    // Drag back past threshold closes
                                    if (openEdge == .trailing && dx > snapThreshold)
                                        || (openEdge == .leading && dx < -snapThreshold) {
                                        close()
                                    }
                                } else if dx < -snapThreshold, !trailingActions.isEmpty {
                                    openEdge = .trailing
                                    activeSwipeItemId = itemId
                                } else if dx > snapThreshold, !leadingActions.isEmpty {
                                    openEdge = .leading
                                    activeSwipeItemId = itemId
                                }
                            }
                        }
                )
                .onTapGesture {
                    if isOpen {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            close()
                        }
                    }
                }
        }
        .clipped()
        .onChange(of: activeSwipeItemId) { _, newId in
            // When another row opens, this one closes automatically
            if newId != itemId && openEdge != nil {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    openEdge = nil
                }
            }
        }
    }

    private func close() {
        openEdge = nil
        if activeSwipeItemId == itemId {
            activeSwipeItemId = nil
        }
    }

    private func actionButton(_ action: SwipeRowAction) -> some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                close()
            }
            action.action()
        } label: {
            Image(systemName: action.icon)
                .font(.outfitTitle3)
                .foregroundStyle(action.tint)
                .frame(width: buttonWidth)
                .frame(maxHeight: .infinity)
        }
        .buttonStyle(.plain)
    }
}
