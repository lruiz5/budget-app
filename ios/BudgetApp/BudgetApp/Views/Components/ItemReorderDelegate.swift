import SwiftUI

struct ItemReorderDelegate: DropDelegate {
    let item: BudgetItem
    @Binding var items: [BudgetItem]
    @Binding var draggingItem: BudgetItem?
    let onReorder: ([Int]) -> Void

    func dropEntered(info: DropInfo) {
        guard let dragging = draggingItem,
              dragging.id != item.id,
              let fromIndex = items.firstIndex(where: { $0.id == dragging.id }),
              let toIndex = items.firstIndex(where: { $0.id == item.id })
        else { return }

        withAnimation(.easeInOut(duration: 0.2)) {
            items.move(fromOffsets: IndexSet(integer: fromIndex), toOffset: toIndex > fromIndex ? toIndex + 1 : toIndex)
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        onReorder(items.map { $0.id })
        draggingItem = nil
        return true
    }
}
