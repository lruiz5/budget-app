import SwiftUI
import UniformTypeIdentifiers

struct BudgetItemDropDelegate: DropDelegate {
    let item: BudgetItem
    @Binding var items: [BudgetItem]
    @Binding var draggingItem: BudgetItem?
    @Binding var highlightedDropTargetId: Int?
    let onReorder: ([Int]) -> Void
    let onAssignTransaction: ((Int, Int) -> Void)?

    func dropEntered(info: DropInfo) {
        if let dragging = draggingItem, dragging.id != item.id {
            // Reorder within category
            guard let fromIndex = items.firstIndex(where: { $0.id == dragging.id }),
                  let toIndex = items.firstIndex(where: { $0.id == item.id })
            else { return }
            withAnimation(.easeInOut(duration: 0.2)) {
                items.move(fromOffsets: IndexSet(integer: fromIndex), toOffset: toIndex > fromIndex ? toIndex + 1 : toIndex)
            }
        } else if draggingItem == nil {
            // External drop (transaction from tray)
            highlightedDropTargetId = item.id
        }
    }

    func dropExited(info: DropInfo) {
        if highlightedDropTargetId == item.id {
            highlightedDropTargetId = nil
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: draggingItem != nil ? .move : .copy)
    }

    func performDrop(info: DropInfo) -> Bool {
        highlightedDropTargetId = nil

        if draggingItem != nil {
            // Reorder
            onReorder(items.map { $0.id })
            draggingItem = nil
            return true
        }

        // Transaction assignment from tray
        guard let provider = info.itemProviders(for: [.text]).first else { return false }
        provider.loadObject(ofClass: NSString.self) { reading, _ in
            guard let str = reading as? String,
                  str.hasPrefix("txn:"),
                  let txnId = Int(String(str.dropFirst(4)))
            else { return }
            DispatchQueue.main.async {
                onAssignTransaction?(txnId, item.id)
            }
        }
        return true
    }
}
