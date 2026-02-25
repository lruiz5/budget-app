import SwiftUI

struct SwipeToDeleteRow<Content: View>: View {
    let itemId: Int
    @Binding var activeSwipeItemId: Int?
    let onDelete: () -> Void
    @ViewBuilder let content: () -> Content

    @State private var offset: CGFloat = 0
    @GestureState private var dragOffset: CGFloat = 0

    private let deleteButtonWidth: CGFloat = 80
    private let snapThreshold: CGFloat = 40

    private var isOpen: Bool {
        activeSwipeItemId == itemId
    }

    private var currentOffset: CGFloat {
        if isOpen {
            return -deleteButtonWidth + min(dragOffset, 0)
        } else {
            return min(dragOffset, 0)
        }
    }

    var body: some View {
        ZStack(alignment: .trailing) {
            // Delete button behind content
            HStack(spacing: 0) {
                Spacer()
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        activeSwipeItemId = nil
                    }
                    onDelete()
                } label: {
                    Image(systemName: "trash.fill")
                        .font(.outfitTitle3)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                .frame(width: deleteButtonWidth)
            }

            // Main content
            content()
                .background(Color(.secondarySystemGroupedBackground))
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
                            let horizontalDrag = value.translation.width
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                if isOpen {
                                    // If open and swiped right, close
                                    if horizontalDrag > snapThreshold {
                                        activeSwipeItemId = nil
                                    }
                                    // Otherwise stay open
                                } else {
                                    // If closed and swiped left past threshold, open
                                    if horizontalDrag < -snapThreshold {
                                        activeSwipeItemId = itemId
                                    }
                                }
                            }
                        }
                )
                .onTapGesture {
                    if isOpen {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            activeSwipeItemId = nil
                        }
                    }
                }
        }
        .clipped()
        .onChange(of: activeSwipeItemId) { _, newId in
            // When another row opens, this one closes automatically via the binding
            if newId != itemId {
                offset = 0
            }
        }
    }
}
